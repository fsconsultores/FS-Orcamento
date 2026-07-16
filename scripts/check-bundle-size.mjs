#!/usr/bin/env node
/**
 * Guarda de regressão de bundle: roda `next build`, extrai o "First Load JS"
 * de cada rota da própria tabela impressa pelo build, e compara contra um
 * baseline commitado (scripts/bundle-baseline.json). Se alguma rota crescer
 * mais que o limite (padrão 15%), falha com exit code 1 — dá pra plugar
 * isso num step de CI para barrar PRs que inflam o bundle sem querer.
 *
 * Uso:
 *   node scripts/check-bundle-size.mjs             # compara contra o baseline
 *   node scripts/check-bundle-size.mjs --update     # roda o build e regrava o baseline
 *   node scripts/check-bundle-size.mjs --threshold=10   # limite customizado (%)
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BASELINE_PATH = path.join(__dirname, 'bundle-baseline.json')

const args = process.argv.slice(2)
const shouldUpdate = args.includes('--update')
const thresholdArg = args.find(a => a.startsWith('--threshold='))
const THRESHOLD_PCT = thresholdArg ? Number(thresholdArg.split('=')[1]) : 15

function parseSize(str) {
  const m = str.trim().match(/^([\d.]+)\s*(B|kB|MB)$/)
  if (!m) return null
  const n = Number(m[1])
  const mult = m[2] === 'MB' ? 1024 * 1024 : m[2] === 'kB' ? 1024 : 1
  return Math.round(n * mult)
}

function runBuild() {
  console.log('[bundle-check] rodando `next build`...')
  const output = execSync('npx next build', { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  return output
}

function parseRoutes(buildOutput) {
  const lines = buildOutput.split('\n')
  const routes = {}
  // Linha típica: "├ ƒ /orcamentos/[id]/planilha              46.4 kB         212 kB"
  const re = /^[│├└]\s*[○ƒ●]?\s*(\/\S*)\s+([\d.]+\s*(?:B|kB|MB))\s+([\d.]+\s*(?:B|kB|MB))\s*$/
  for (const line of lines) {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, '') // remove cores ANSI
    const m = clean.match(re)
    if (!m) continue
    const [, route, , firstLoad] = m
    const bytes = parseSize(firstLoad)
    if (bytes != null) routes[route] = bytes
  }
  return routes
}

function fmtKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} kB`
}

const output = runBuild()
const current = parseRoutes(output)

if (Object.keys(current).length === 0) {
  console.error('[bundle-check] Não consegui extrair nenhuma rota da saída do build — formato da tabela pode ter mudado. Abortando sem falhar o build.')
  process.exit(0)
}

if (shouldUpdate || !existsSync(BASELINE_PATH)) {
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n')
  console.log(`[bundle-check] Baseline ${shouldUpdate ? 'atualizado' : 'criado'} com ${Object.keys(current).length} rotas em ${BASELINE_PATH}`)
  process.exit(0)
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
let hasRegression = false
const rows = []

for (const [route, bytes] of Object.entries(current)) {
  const before = baseline[route]
  if (before == null) {
    rows.push(`  🆕 ${route}: ${fmtKb(bytes)} (rota nova, sem baseline)`)
    continue
  }
  const deltaPct = ((bytes - before) / before) * 100
  if (deltaPct > THRESHOLD_PCT) {
    hasRegression = true
    rows.push(`  🔴 ${route}: ${fmtKb(before)} → ${fmtKb(bytes)} (+${deltaPct.toFixed(1)}%, limite ${THRESHOLD_PCT}%)`)
  } else if (Math.abs(deltaPct) > 3) {
    rows.push(`  ${deltaPct > 0 ? '🟡' : '🟢'} ${route}: ${fmtKb(before)} → ${fmtKb(bytes)} (${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%)`)
  }
}

console.log(`\n[bundle-check] Comparado contra baseline (${Object.keys(baseline).length} rotas):`)
if (rows.length === 0) {
  console.log('  Nenhuma mudança relevante (>3%).')
} else {
  console.log(rows.join('\n'))
}

if (hasRegression) {
  console.error(`\n[bundle-check] ❌ Regressão de bundle acima de ${THRESHOLD_PCT}% detectada. Rode com --update se o crescimento foi intencional.`)
  process.exit(1)
}
console.log('\n[bundle-check] ✅ Sem regressão acima do limite.')
