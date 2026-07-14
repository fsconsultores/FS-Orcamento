'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ImportInsumoRow, ImportComposicaoRow, ImportResult } from '@/app/(app)/orcamentos/[id]/importar/import-action'
import { Button } from '@/components/ui/button'
import { ImportResultBox } from '@/components/import-result-box'
import { WizardSteps } from '@/components/ui/import-wizard'

const STEPS = [
  { key: 'selecionar', label: 'Selecionar' },
  { key: 'resultado', label: 'Resultado' },
]

// ─── Parsing utilities ────────────────────────────────────────────────────────

const COL_ALIASES: Record<string, string[]> = {
  codigo:      ['cod', 'codigo', 'code', 'codigodacomposicao', 'coddacomposicao'],
  codigo_item: ['codigodoitem', 'coddoitem', 'codigoitem', 'coditem', 'codigodoinsumo', 'codigodoservico'],
  descricao:   ['descricao', 'descr', 'description', 'nome', 'name', 'descricaoabreviada', 'descricaodoinsumo', 'descricaodacomposicao', 'descricaodoservico'],
  unidade:     ['unidade', 'und', 'un', 'unit', 'unidadedemedida', 'unid', 'unidadedacomposicao'],
  custo:       ['custo', 'preco', 'price', 'valor', 'custounit', 'custounitario', 'runit', 'mediana',
                'medianadesonerado', 'medianadesonerada', 'precomediano', 'precomedianodesonerado',
                'custounitariodesonerado', 'precototal'],
  indice:      ['indice', 'coeficiente', 'coef', 'coefutil', 'coeficienteutil', 'qtd', 'quantidade', 'qt', 'qtde'],
  grupo:       ['grupo', 'grupois', 'grupoinsumo', 'grupodoinsumo', 'group', 'categoria'],
  base:        ['base', 'fonte', 'cotacao', 'source'],
  data_ref:    ['dataref', 'datareferencia', 'datadereferencia', 'ref'],
}

function normCol(s: string): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/[^a-z0-9]/g, '')
}

function detectCols(header: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  const cache: Record<string, string[]> = {}
  for (const [field, aliases] of Object.entries(COL_ALIASES)) cache[field] = aliases.map(normCol)
  header.forEach((h, i) => {
    const lower = normCol(h)
    for (const [field, norms] of Object.entries(cache)) {
      if (norms.includes(lower) && !(field in map)) map[field] = i
    }
  })
  return map
}

function findHeaderRow(data: unknown[][]): number {
  let bestRow = 0, bestScore = 0
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const score = Object.keys(detectCols((data[i] as unknown[]).map(String))).length
    if (score > bestScore) { bestScore = score; bestRow = i }
  }
  return bestRow
}

function parseNumber(val: unknown): number {
  if (typeof val === 'number') return val
  const s = String(val ?? '').replace(',', '.').replace(/[^\d.-]/g, '')
  return parseFloat(s) || 0
}

function parseDate(val: unknown): string | null {
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    const y = val.getUTCFullYear()
    const m = String(val.getUTCMonth() + 1).padStart(2, '0')
    const d = String(val.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(val ?? '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/')
    return `${y}-${m}-${d}`
  }
  // Excel serial date: 25569 = 1970-01-01, 73050 ≈ 2099-12-31
  const n = Number(s)
  if (!isNaN(n) && n > 25569 && n < 73050) {
    const dt = new Date((n - 25569) * 86400000)
    const y = dt.getUTCFullYear()
    const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dt.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return null
}

function isSICROData(data: unknown[][]): boolean {
  for (let i = 0; i < Math.min(data.length, 40); i++) {
    for (const cell of data[i] as unknown[]) {
      const s = String(cell ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
      if (s.includes('sicro') || s.includes('sistema de custos referenciais')) return true
    }
  }
  return false
}

function parseSICROSheet(data: unknown[][]): { rows: ImportComposicaoRow[]; erros: string[] } {
  const rows: ImportComposicaoRow[] = []
  let current: ImportComposicaoRow | null = null
  let secao: 'A'|'B'|'C'|'D'|'E'|null = null
  let producao = 1
  let compUnit = ''

  const normS = (v: unknown) =>
    String(v ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()

  function extractProducao(row: unknown[]): { val: number; unit: string } | null {
    for (let k = 0; k < row.length; k++) {
      const ns = normS(row[k])
      if (!ns.includes('producao da equipe') && !ns.includes('producao equipe')) continue
      for (let l = k; l < Math.min(row.length, k + 4); l++) {
        const s = String(row[l] ?? '').trim()
        const m = s.match(/([\d]+[.,][\d]+)/)
        if (!m) continue
        const val = parseNumber(m[1])
        if (val <= 0 || val > 100000) continue
        let unit = s.slice(s.indexOf(m[0]) + m[0].length).trim()
        if (!unit) {
          const nxt = String(row[l + 1] ?? '').trim()
          if (nxt && nxt.length <= 10 && !/^\d/.test(nxt)) unit = nxt
        }
        return { val, unit }
      }
    }
    return null
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i] as unknown[]
    const cells = row.map(c => String(c ?? '').trim())
    if (cells.every(c => !c)) continue

    const first = cells.find(c => c) ?? ''
    const firstN = normS(first)

    const secM = firstN.match(/^([a-e])\s*[-–]\s*(equipament|mao de obra|material|atividad|tempo)/)
    if (secM) {
      secao = secM[1].toUpperCase() as 'A'|'B'|'C'|'D'|'E'
      continue
    }

    const compM = first.match(/^(\d{7,})\s*(.*)/)
    if (compM) {
      const cod = compM[1]
      let desc = compM[2].trim()
      if (!desc) {
        for (let j = 1; j < cells.length; j++) {
          if (cells[j] && cells[j].length > 3) { desc = cells[j]; break }
        }
      }
      producao = 1; compUnit = ''
      for (let scan = Math.max(0, i - 5); scan < Math.min(data.length, i + 8); scan++) {
        const p = extractProducao(data[scan] as unknown[])
        if (p) { producao = p.val; compUnit = p.unit; break }
      }
      current = { codigo: cod, descricao: desc || cod, unidade: compUnit, base: null, insumos: [] }
      rows.push(current)
      secao = null
      continue
    }

    if (!current || !secao) continue
    if (!/^[A-Z]\d{4}/.test(first)) continue
    if (/custo|total|subtotal|producao/.test(firstN)) continue

    const desc2 = cells[1] ?? ''
    const nums: number[] = []
    let unit2 = ''
    for (let j = 2; j < cells.length; j++) {
      const v = parseNumber(cells[j])
      if (v > 0) nums.push(v)
      else if (!unit2 && cells[j] && cells[j].length <= 8 && !/^\d/.test(cells[j])) unit2 = cells[j]
    }
    if (!nums.length) continue

    const qty = nums[0]
    const unitCost = nums.length >= 2 ? nums[nums.length - 2] : nums[0]
    const isLabor = secao === 'B' || secao === 'A'
    const rawIndice = isLabor ? (producao > 0 ? qty / producao : qty) : qty
    const indice = Math.min(Math.max(rawIndice, 0.000001), 99999999)
    const custo = Math.min(unitCost, 9999999999)
    if (!isFinite(indice) || !isFinite(custo)) continue
    const grupo = secao === 'A' ? 'Equipamento' : secao === 'B' ? 'Mao de Obra'
               : secao === 'C' ? 'Material' : secao === 'D' ? 'Atividade Auxiliar' : null

    current.insumos.push({ codigo: first, descricao: desc2, unidade: unit2, custo, indice, grupo, base: null, data_ref: null })
  }

  return { rows: rows.filter(r => r.insumos.length > 0), erros: [] }
}

function isSudecap(header: string[]): boolean {
  const joined = header.map(normCol).join('|')
  return joined.includes('tipoitem') || joined.includes('insumocomposicao')
    || joined.includes('origemcomposicao') || joined.includes('producaoequipe')
}

// ─── Parser SUDECAP Relatório (posicional, independente de cabeçalho) ──────────
// Formato: CÓDIGO | CÓDIGO/DESCRIÇÃO | UND | CONSUMO
// A detecção é feita pelos DADOS: linhas com número decimal no final = insumo.

function inferSudecapRow(row: unknown[]): { codigo: string; descricao: string; unidade: string; consumoStr: string } {
  const cells = row.map(c => String(c ?? '').trim())

  // Célula mais à direita com conteúdo
  let rightIdx = -1
  for (let j = cells.length - 1; j >= 0; j--) { if (cells[j]) { rightIdx = j; break } }
  const rightRaw = rightIdx >= 0 ? row[rightIdx] : ''
  const rightVal = rightIdx >= 0 ? cells[rightIdx] : ''
  const rightNum = typeof rightRaw === 'number' ? rightRaw : parseFloat(rightVal.replace(',', '.'))
  const isInsumo = rightVal !== '' && !isNaN(rightNum) && rightNum > 0 && rightNum < 100000
    && (typeof rightRaw === 'number' || /[,.]/.test(rightVal))

  // Célula mais à esquerda com conteúdo = código
  let leftIdx = -1
  for (let j = 0; j < cells.length; j++) { if (cells[j]) { leftIdx = j; break } }
  const codigo = leftIdx >= 0 ? cells[leftIdx] : ''

  // UND: célula curta imediatamente antes do CONSUMO
  let unidade = ''
  if (isInsumo && rightIdx > 0) {
    for (let j = rightIdx - 1; j > leftIdx; j--) {
      const v = cells[j]
      if (v && v.length <= 6 && !/\d{5}/.test(v)) { unidade = v; break }
    }
  }

  // Descrição: célula mais longa que não seja código, UND ou CONSUMO
  let descricao = ''
  for (let j = leftIdx + 1; j < cells.length; j++) {
    const v = cells[j]
    if (!v || v === unidade || v === rightVal || j === rightIdx) continue
    if (v.length > descricao.length) descricao = v
  }

  return { codigo, descricao, unidade, consumoStr: isInsumo ? rightVal : '' }
}

function sniffSudecapRelatorio(data: unknown[][]): boolean {
  // Procura pelo menos 2 linhas com padrão insumo: número decimal à direita + código pontilhado
  let hits = 0
  for (let i = 0; i < Math.min(data.length, 60); i++) {
    const { codigo, consumoStr } = inferSudecapRow(data[i] as unknown[])
    if (consumoStr && /\d+\.\d+/.test(codigo)) hits++
    if (hits >= 2) return true
  }
  return false
}

function parseSudecapRelatorio(data: unknown[][]): { rows: ImportComposicaoRow[]; erros: string[] } {
  const rows: ImportComposicaoRow[] = []
  if (data.length < 2) return { rows, erros: [] }

  let current: ImportComposicaoRow | null = null
  const GRUPOS_SUDECAP = new Set(['PC', 'A', 'S', 'E', 'H', 'HH', 'M', 'B', 'AC', 'L'])

  for (let i = 0; i < data.length; i++) {
    const { codigo, descricao, unidade, consumoStr } = inferSudecapRow(data[i] as unknown[])
    if (!codigo && !descricao) continue

    const consumo = parseNumber(consumoStr)

    if (consumoStr && consumo > 0) {
      if (!current) continue
      let desc = descricao
      let grupo: string | null = null
      const m = desc.match(/\s+([A-Za-z]{1,3})$/)
      if (m && GRUPOS_SUDECAP.has(m[1].toUpperCase())) {
        grupo = m[1].toUpperCase()
        desc = desc.slice(0, desc.length - m[0].length).trim()
      }
      current.insumos.push({ codigo, descricao: desc, unidade, custo: 0, indice: consumo, grupo, base: null, data_ref: null })
    } else {
      const dotCount = (codigo.match(/\./g) ?? []).length
      if (dotCount >= 2) {
        current = { codigo, descricao, unidade, base: null, insumos: [] }
        rows.push(current)
      } else {
        current = null
      }
    }
  }

  return { rows: rows.filter(r => r.insumos.length > 0), erros: [] }
}

// Flat insumos (IS*, IS GESTOR, etc.)
function parseFlat(data: unknown[][]): { rows: ImportInsumoRow[]; erros: string[] } {
  const erros: string[] = []
  if (data.length < 2) return { rows: [], erros: ['Planilha vazia.'] }
  const headerIdx = findHeaderRow(data)
  const cols = detectCols((data[headerIdx] as unknown[]).map(String))
  if (!('descricao' in cols)) return { rows: [], erros: ['Coluna "descricao" não encontrada.'] }
  // Formato analítico SINAPI detectado na aba de insumos
  if ('codigo' in cols && 'codigo_item' in cols && 'indice' in cols)
    return { rows: [], erros: ['Esta aba parece ser analítica (tem "Código da Composição" e "Código do Item"). Use-a na aba de Composições, não de Insumos.'] }
  const codigoCol = 'codigo' in cols ? 'codigo' : 'codigo_item' in cols ? 'codigo_item' : null
  const rows: ImportInsumoRow[] = []
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const descricao = String(row[cols.descricao] ?? '').trim()
    if (!descricao) continue
    rows.push({
      codigo:   codigoCol ? String(row[cols[codigoCol]] ?? '').trim() : '',
      descricao,
      unidade:  'unidade'  in cols ? String(row[cols.unidade]  ?? '').trim() : '',
      custo:    'custo'    in cols ? parseNumber(row[cols.custo]) : 0,
      indice:   1,
      grupo:    'grupo'    in cols ? String(row[cols.grupo]    ?? '').trim() || null : null,
      base:     'base'     in cols ? String(row[cols.base]     ?? '').trim() || null : null,
      data_ref: 'data_ref' in cols ? parseDate(row[cols.data_ref]) : null,
    })
  }
  return { rows, erros }
}

// Flat composições sem sub-itens (CS*)
function parseFlatComposicoes(data: unknown[][]): { rows: ImportComposicaoRow[]; erros: string[] } {
  const erros: string[] = []
  if (data.length < 2) return { rows: [], erros: ['Planilha vazia.'] }
  const headerIdx = findHeaderRow(data)
  const cols = detectCols((data[headerIdx] as unknown[]).map(String))
  if (!('descricao' in cols)) return { rows: [], erros: ['Coluna "descricao" não encontrada.'] }
  const rows: ImportComposicaoRow[] = []
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const descricao = String(row[cols.descricao] ?? '').trim()
    if (!descricao) continue
    rows.push({
      codigo:  'codigo'  in cols ? String(row[cols.codigo]  ?? '').trim() : '',
      descricao,
      unidade: 'unidade' in cols ? String(row[cols.unidade] ?? '').trim() : '',
      base: null, insumos: [],
    })
  }
  return { rows, erros }
}

// Base própria/SUDECAP/CPU: detecta colunas pelo cabeçalho; fallbacks para índices clássicos.
function parseSudecap(data: unknown[][]): { rows: ImportComposicaoRow[]; erros: string[] } {
  const rows: ImportComposicaoRow[] = []
  let current: ImportComposicaoRow | null = null
  if (data.length < 2) return { rows, erros: [] }

  const hdr = (data[0] as unknown[]).map(c => normCol(String(c ?? '')))
  const col = (keys: string[], fallback: number) => {
    for (const k of keys) { const i = hdr.indexOf(k); if (i !== -1) return i }
    return fallback
  }
  const C = {
    codigoComp:  col(['codigo', 'codigodacomposicao', 'coddacomposicao'], 0),
    descComp:    col(['descricao', 'descricaodacomposicao', 'descricaoabreviada'], 1),
    unidadeComp: col(['unidade', 'unidadedacomposicao'], 2),
    tipoItem:    col(['tipoitem', 'tipoitemcomposicao'], 5),
    codigoIns:   col(['codigodoitem', 'codigodoinsumo', 'coditem', 'codigoitem'], 6),
    descIns:     col(['descricaodoinsumo', 'descricaoabreviadainsumo', 'descricaoabreviadaitem', 'descricaoitem'], 7),
    unidadeIns:  col(['unidadeitem', 'unidadedoinsumo', 'unidadeinsumo'], 8),
    indice:      col(['indice', 'coeficiente', 'coef', 'coefutil'], 9),
    grupo:       col(['grupodoinsumo', 'grupoinsumo', 'grupo'], 10),
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const codigoComp  = String(row[C.codigoComp]  ?? '').trim()
    const descComp    = String(row[C.descComp]    ?? '').trim()
    const unidadeComp = String(row[C.unidadeComp] ?? '').trim()
    const tipoItem    = String(row[C.tipoItem]    ?? '').trim().toUpperCase()
    const codigoIns   = String(row[C.codigoIns]   ?? '').trim()
    const descIns     = String(row[C.descIns]     ?? '').trim()
    const unidadeIns  = String(row[C.unidadeIns]  ?? '').trim()
    const indice      = parseFloat(String(row[C.indice] ?? '1').replace(',', '.')) || 1
    const grupo       = String(row[C.grupo]       ?? '').trim() || null
    if (!codigoComp && !descComp && !descIns) continue
    if (codigoComp && descComp) {
      current = { codigo: codigoComp, descricao: descComp, unidade: unidadeComp, base: null, insumos: [] }
      rows.push(current)
    }
    if ((tipoItem === 'I' || tipoItem === 'C') && descIns && current) {
      current.insumos.push({ codigo: codigoIns, descricao: descIns, unidade: unidadeIns, custo: 0, indice, grupo, base: null, data_ref: null })
    }
  }
  return { rows, erros: [] }
}

// Analítico: detecta colunas.
// Formato SINAPI analítico: tem "Código da Composição" (codigo) E "Código do Item" (codigo_item).
//   Linha pai = codigo_item vazio; linha filho = codigo_item preenchido.
// Outros formatos hierárquicos: linha com codigo = pai, linha sem codigo = filho.
function parseAnalitico(data: unknown[][]): { rows: ImportComposicaoRow[]; erros: string[] } {
  const erros: string[] = []
  if (data.length < 2) return { rows: [], erros: ['Planilha vazia.'] }
  const headerIdx = findHeaderRow(data)
  const cols = detectCols((data[headerIdx] as unknown[]).map(String))
  if (!('descricao' in cols)) return { rows: [], erros: ['Coluna "descricao" não encontrada.'] }
  const rows: ImportComposicaoRow[] = []
  let current: ImportComposicaoRow | null = null
  const isSINAPI = 'codigo' in cols && 'codigo_item' in cols
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const descricao = String(row[cols.descricao] ?? '').trim()
    if (!descricao) continue
    const unidade = 'unidade' in cols ? String(row[cols.unidade] ?? '').trim() : ''
    if (isSINAPI) {
      const codigoComp = String(row[cols.codigo]      ?? '').trim()
      const codigoItem = String(row[cols.codigo_item] ?? '').trim()
      if (!codigoItem) {
        // linha pai: Código do Item vazio
        current = { codigo: codigoComp, descricao, unidade, base: null, insumos: [] }
        rows.push(current)
      } else if (current) {
        current.insumos.push({
          codigo:  codigoItem,
          descricao, unidade,
          custo:   'custo'  in cols ? parseNumber(row[cols.custo])  : 0,
          indice:  'indice' in cols ? parseNumber(row[cols.indice]) || 1 : 1,
          grupo:   'grupo'  in cols ? String(row[cols.grupo]  ?? '').trim() || null : null,
          base: null, data_ref: null,
        })
      }
    } else {
      const codigo = 'codigo' in cols ? String(row[cols.codigo] ?? '').trim() : ''
      if (codigo) {
        current = { codigo, descricao, unidade, base: null, insumos: [] }
        rows.push(current)
      } else if (current) {
        current.insumos.push({
          codigo:  '',
          descricao, unidade,
          custo:   'custo'  in cols ? parseNumber(row[cols.custo])  : 0,
          indice:  'indice' in cols ? parseNumber(row[cols.indice]) || 1 : 1,
          grupo:   'grupo'  in cols ? String(row[cols.grupo]  ?? '').trim() || null : null,
          base: null, data_ref: null,
        })
      }
    }
  }
  return { rows, erros }
}

// Detecta o melhor parser para uma aba de composições
function parseComposicoes(data: unknown[][]): { rows: ImportComposicaoRow[]; erros: string[]; fmt: string } {
  if (data.length < 2) return { rows: [], erros: ['Planilha vazia.'], fmt: 'vazio' }
  if (isSICROData(data)) return { ...parseSICROSheet(data), fmt: 'DNIT/SICRO' }
  const headerIdx = findHeaderRow(data)
  const header = (data[headerIdx] as unknown[]).map(String)
  if (isSudecap(header)) return { ...parseSudecap(data), fmt: 'SUDECAP/CPU' }
  const cols = detectCols(header)
  if ('indice' in cols) {
    const fmt = ('codigo' in cols && 'codigo_item' in cols) ? 'Analítico SINAPI' : 'Analítico'
    return { ...parseAnalitico(data), fmt }
  }
  // Detecta pelo padrão dos dados (independente do cabeçalho)
  if (sniffSudecapRelatorio(data)) return { ...parseSudecapRelatorio(data), fmt: 'SUDECAP Relatório' }
  return { ...parseFlatComposicoes(data), fmt: 'Lista plana' }
}

// ─── Importação browser-side ───────────────────────────────────────────────────

async function importarInsumos(sb: any, baseId: string, rows: ImportInsumoRow[]): Promise<ImportResult> {
  const result: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [] }
  const allCodigos = rows.map(r => r.codigo).filter(Boolean)
  for (let i = 0; i < allCodigos.length; i += 500)
    await sb.from('tabela_insumos').delete().eq('base_id', baseId).in('codigo', allCodigos.slice(i, i + 500))
  const insRows = rows.map(r => ({ codigo: r.codigo, descricao: r.descricao, unidade: r.unidade, preco_base: r.custo, grupo: r.grupo, fonte: r.base, data_referencia: r.data_ref, base_id: baseId }))
  for (let i = 0; i < insRows.length; i += 500) {
    const { error } = await sb.from('tabela_insumos').insert(insRows.slice(i, i + 500))
    if (error) result.erros.push(`Lote ${i / 500 + 1}: ${error.message}`)
    else result.insumosCriados += Math.min(500, insRows.length - i)
  }
  return result
}

async function importarComposicoes(sb: any, baseId: string, rows: ImportComposicaoRow[]): Promise<ImportResult> {
  const result: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [], gruposAtualizados: 0 }
  const insumosPorCodigo = new Map<string, ImportInsumoRow>()
  for (const comp of rows)
    for (const ins of comp.insumos)
      if (ins.codigo && !insumosPorCodigo.has(ins.codigo)) insumosPorCodigo.set(ins.codigo, ins)
  const todosCodigos = [...insumosPorCodigo.keys()]
  const codeToId = new Map<string, string>()
  const codeToGrupoAtual = new Map<string, string | null>()
  for (let i = 0; i < todosCodigos.length; i += 500) {
    const { data } = await sb.from('tabela_insumos').select('id, codigo, grupo').eq('base_id', baseId).in('codigo', todosCodigos.slice(i, i + 500))
    for (const ins of (data ?? []) as { id: string; codigo: string; grupo: string | null }[]) {
      codeToId.set(ins.codigo, ins.id)
      codeToGrupoAtual.set(ins.codigo, ins.grupo)
    }
  }
  const ausentes = todosCodigos.filter(c => !codeToId.has(c))
  const ausentesSet = new Set(ausentes)
  for (let i = 0; i < ausentes.length; i += 500) {
    const lote = ausentes.slice(i, i + 500).map(codigo => {
      const ins = insumosPorCodigo.get(codigo)!
      return { codigo, descricao: ins.descricao, unidade: ins.unidade, preco_base: ins.custo, grupo: ins.grupo, fonte: ins.base, data_referencia: ins.data_ref, base_id: baseId }
    })
    const { data, error } = await sb.from('tabela_insumos').insert(lote).select('id, codigo')
    if (error) { result.erros.push(`Insumos automáticos: ${error.message}`); break }
    for (const ins of (data ?? []) as { id: string; codigo: string }[]) { codeToId.set(ins.codigo, ins.id); result.insumosCriados++ }
  }

  // Backfill: insumos que já existiam na base sem grupo recebem o grupo desta importação
  const grupoToIds = new Map<string, string[]>()
  for (const codigo of todosCodigos) {
    if (codeToGrupoAtual.get(codigo)) continue // já tem grupo — não sobrescreve
    if (!codeToId.has(codigo) || ausentesSet.has(codigo)) continue // recém-criado, já saiu com grupo
    const novoGrupo = insumosPorCodigo.get(codigo)?.grupo
    if (!novoGrupo) continue
    const id = codeToId.get(codigo)!
    if (!grupoToIds.has(novoGrupo)) grupoToIds.set(novoGrupo, [])
    grupoToIds.get(novoGrupo)!.push(id)
  }
  await Promise.all(
    [...grupoToIds.entries()].flatMap(([grupo, ids]) =>
      Array.from({ length: Math.ceil(ids.length / 500) }, (_, j) =>
        sb.from('tabela_insumos').update({ grupo }).in('id', ids.slice(j * 500, (j + 1) * 500))
      )
    )
  )
  result.gruposAtualizados = [...grupoToIds.values()].reduce((acc, ids) => acc + ids.length, 0)
  const rowsMap = new Map<string, ImportComposicaoRow>()
  for (const r of rows) { if (!rowsMap.has(r.codigo)) rowsMap.set(r.codigo, r) }
  const rowsUniq = [...rowsMap.values()]
  const compCodeToId = new Map<string, string>()
  for (let i = 0; i < rowsUniq.length; i += 500) {
    const { data } = await sb.from('tabela_composicoes').select('id, codigo').eq('base_id', baseId).in('codigo', rowsUniq.slice(i, i + 500).map(r => r.codigo))
    for (const c of (data ?? []) as { id: string; codigo: string }[]) compCodeToId.set(c.codigo, c.id)
  }
  const novas = rowsUniq.filter(r => !compCodeToId.has(r.codigo))
  for (let i = 0; i < novas.length; i += 50) {
    const lote = novas.slice(i, i + 50)
    const { data, error } = await sb.from('tabela_composicoes').insert(lote.map(c => ({ codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, base_id: baseId }))).select('id, codigo')
    if (error) { result.erros.push(`Composições: ${error.message}`); continue }
    for (const c of (data ?? []) as { id: string; codigo: string }[]) compCodeToId.set(c.codigo, c.id)
    result.composicoesCriadas += (data ?? []).length
  }
  // Apaga itens antigos de TODAS as composições importadas (novas e existentes) para reinserir
  const allCompIds = [...compCodeToId.values()]
  for (let i = 0; i < allCompIds.length; i += 500)
    await sb.from('tabela_itens_composicao').delete().in('composicao_id', allCompIds.slice(i, i + 500))
  // Insere itens para TODAS as composições (não só as novas)
  for (let i = 0; i < rowsUniq.length; i += 50) {
    const lote = rowsUniq.slice(i, i + 50)
    const itens = lote.flatMap(comp => {
      const compId = compCodeToId.get(comp.codigo)
      if (!compId) return []
      const dedup = new Map<string, { composicao_id: string; insumo_id: string; indice: number }>()
      for (const ins of comp.insumos) {
        const insumoId = codeToId.get(ins.codigo)
        if (!insumoId) continue
        if (dedup.has(insumoId)) dedup.get(insumoId)!.indice += ins.indice ?? 1
        else dedup.set(insumoId, { composicao_id: compId, insumo_id: insumoId, indice: ins.indice ?? 1 })
      }
      return [...dedup.values()]
    })
    if (itens.length > 0) {
      const { error } = await sb.from('tabela_itens_composicao').insert(itens)
      if (error) result.erros.push(`Itens: ${error.message}`)
    }
  }
  return result
}

// ─── UI ───────────────────────────────────────────────────────────────────────

function ResultBox({ result }: { result: ImportResult }) {
  const ok = result.erros.length === 0
  return (
    <ImportResultBox variant={ok ? 'success' : 'warning'} title={ok ? 'Importação concluída!' : 'Importação com avisos'}>
      <p>
        {result.composicoesCriadas > 0 && <>{result.composicoesCriadas} composição(ões), </>}
        {result.insumosCriados} insumo(s) importados.
        {!!result.gruposAtualizados && <> {result.gruposAtualizados} grupo(s) preenchido(s) em insumos existentes.</>}
      </p>
      {result.erros.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-700">
          {result.erros.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
          {result.erros.length > 10 && <li>...e mais {result.erros.length - 10} avisos.</li>}
        </ul>
      )}
    </ImportResultBox>
  )
}

export function SINAPIBaseForm({ baseId, baseNome }: { baseId: string; baseNome: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [allSheets, setAllSheets] = useState<string[]>([])
  const [wbRef, setWbRef] = useState<unknown>(null)

  // Seleção de abas
  const [isSheet, setIsSheet] = useState('')   // aba de insumos
  const [csSheet, setCsSheet] = useState('')   // aba de composições

  const [previewCounts, setPreviewCounts] = useState<{ insumos: number; composicoes: number; fmt: string } | null>(null)
  const [parseErros, setParseErros] = useState<string[]>([])
  const [pendingData, setPendingData] = useState<{ insumos: ImportInsumoRow[]; composicoes: ImportComposicaoRow[] } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null); setPreviewCounts(null); setParseErros([]); setPendingData(null)
    setFileName(file.name); setAllSheets([]); setIsSheet(''); setCsSheet('')
    const ab = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(ab, { type: 'array', cellDates: true })
    setWbRef(wb)
    const sheets = wb.SheetNames
    setAllSheets(sheets)

    // Auto-sugestão inteligente
    const upper = sheets.map(s => s.toUpperCase())
    const suggestIs = sheets.find((_, i) =>
      /^IS[A-Z]/.test(upper[i]) || upper[i].includes('INSUMO') || upper[i].includes('IS ') || upper[i] === 'IS'
    ) ?? ''
    const suggestCs = sheets.find((_, i) =>
      /^CS[A-Z]/.test(upper[i]) || upper[i].includes('CPU') || upper[i].includes('COMPOSICAO') ||
      upper[i].includes('COMPOSIÇÃO') || upper[i].includes('ANALITICO') || upper[i].includes('ANALÍTICO')
    ) ?? ''

    setIsSheet(suggestIs)
    setCsSheet(suggestCs)
  }

  function processPreview(newIsSheet: string, newCsSheet: string) {
    if (!wbRef || (!newIsSheet && !newCsSheet)) { setPendingData(null); setPreviewCounts(null); return }
    void import('xlsx').then(XLSX => {
      const _wb = wbRef as { Sheets: Record<string, unknown> }
      const erros: string[] = []
      let insumos: ImportInsumoRow[] = []
      let composicoes: ImportComposicaoRow[] = []
      let fmt = ''

      if (newIsSheet) {
        const ws = _wb.Sheets[newIsSheet]
        if (ws) {
          const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
          const r = parseFlat(data)
          insumos = r.rows
          erros.push(...r.erros.map(e => `[${newIsSheet}] ${e}`))
        }
      }

      if (newCsSheet) {
        const ws = _wb.Sheets[newCsSheet]
        if (ws) {
          const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
          const r = parseComposicoes(data)
          composicoes = r.rows
          fmt = r.fmt
          erros.push(...r.erros.map(e => `[${newCsSheet}] ${e}`))
        }
      }

      setPendingData({ insumos, composicoes })
      setPreviewCounts({ insumos: insumos.length, composicoes: composicoes.length, fmt })
      setParseErros(erros)
    })
  }

  function onIsSheetChange(v: string) { setIsSheet(v); processPreview(v, csSheet) }
  function onCsSheetChange(v: string) { setCsSheet(v); processPreview(isSheet, v) }

  async function handleImport() {
    if (!pendingData) return
    setLoading(true)
    const sb = createClient() as any
    const combined: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [], gruposAtualizados: 0 }
    try {
      if (pendingData.insumos.length > 0) {
        const r = await importarInsumos(sb, baseId, pendingData.insumos)
        combined.insumosCriados += r.insumosCriados
        combined.erros.push(...r.erros)
      }
      if (pendingData.composicoes.length > 0) {
        const r = await importarComposicoes(sb, baseId, pendingData.composicoes)
        combined.composicoesCriadas += r.composicoesCriadas
        combined.insumosCriados += r.insumosCriados
        combined.gruposAtualizados = (combined.gruposAtualizados ?? 0) + (r.gruposAtualizados ?? 0)
        combined.erros.push(...r.erros)
      }
      setResult(combined)
      setPendingData(null); setPreviewCounts(null)
      if (inputRef.current) inputRef.current.value = ''
      setWbRef(null); setAllSheets([]); setIsSheet(''); setCsSheet(''); setFileName('')
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally { setLoading(false) }
  }

  const sheetOptions = ['', ...allSheets]

  return (
    <div className="space-y-5">
      <WizardSteps steps={STEPS} currentKey={result ? 'resultado' : 'selecionar'} />
      {/* Arquivo */}
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-1">Arquivo <strong>.xlsx</strong> — qualquer formato (SINAPI, SUDECAP, CPU, próprio)</p>
        <p className="text-xs text-gray-400 mb-4">Escolha abaixo quais abas contêm insumos e composições</p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.ods" onChange={handleFile}
          className="block mx-auto text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-primary-700 file:text-white file:text-sm file:font-medium hover:file:bg-primary-800 cursor-pointer" />
        {fileName && <p className="mt-2 text-xs text-gray-400">{fileName}</p>}
      </div>

      {/* Seleção de abas */}
      {allSheets.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aba de <span className="text-primary-700">insumos</span>
              <span className="ml-1 text-xs text-gray-400">(lista de materiais/mão de obra com preço)</span>
            </label>
            <select value={isSheet} onChange={e => onIsSheetChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20">
              {sheetOptions.map(s => <option key={s} value={s}>{s || '— nenhuma —'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aba de <span className="text-amber-600">composições</span>
              <span className="ml-1 text-xs text-gray-400">(serviços com sub-itens/coeficientes)</span>
            </label>
            <select value={csSheet} onChange={e => onCsSheetChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20">
              {sheetOptions.map(s => <option key={s} value={s}>{s || '— nenhuma —'}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Avisos de parse */}
      {parseErros.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3">
          <p className="text-xs font-semibold text-yellow-800 mb-1">Avisos:</p>
          <ul className="text-xs text-yellow-700 space-y-0.5">
            {parseErros.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
          {parseErros.length > 5 && <p className="text-xs text-yellow-600 mt-1">...e mais {parseErros.length - 5} avisos.</p>}
        </div>
      )}

      {/* Preview + botão */}
      {previewCounts && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Pronto para importar para <strong>{baseNome}</strong></p>
            <p className="text-xs text-gray-500 mt-0.5">
              {previewCounts.insumos > 0 && <span>{previewCounts.insumos.toLocaleString('pt-BR')} insumo(s)</span>}
              {previewCounts.insumos > 0 && previewCounts.composicoes > 0 && <span> · </span>}
              {previewCounts.composicoes > 0 && (
                <span>{previewCounts.composicoes.toLocaleString('pt-BR')} composição(ões)
                  {previewCounts.fmt && <span className="text-gray-400"> ({previewCounts.fmt})</span>}
                </span>
              )}
              {previewCounts.insumos === 0 && previewCounts.composicoes === 0 && <span className="text-yellow-600">Nenhum dado encontrado nas abas selecionadas.</span>}
            </p>
          </div>
          {(previewCounts.insumos > 0 || previewCounts.composicoes > 0) && (
            <Button className="shrink-0" onClick={handleImport} loading={loading}>
              Confirmar Importação
            </Button>
          )}
        </div>
      )}

      {result && <ResultBox result={result} />}
    </div>
  )
}
