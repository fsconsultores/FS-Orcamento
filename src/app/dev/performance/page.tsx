import { notFound } from 'next/navigation'
import { getMetricsSnapshot } from '@/lib/dev-metrics/store'
import { AutoRefresh } from './auto-refresh'
import { ClearButton } from './clear-button'

export const dynamic = 'force-dynamic'

function avg(nums: number[]): number {
  return nums.length === 0 ? 0 : nums.reduce((s, n) => s + n, 0) / nums.length
}

function fmtMs(n: number): string {
  return `${n.toFixed(1)}ms`
}

export default function DevPerformancePage() {
  if (process.env.NODE_ENV !== 'development') notFound()

  const { queries, renders, vitals, pageLoads, navs } = getMetricsSnapshot()

  // ── Páginas mais lentas (por tempo total de query) ──────────────────────
  const byPath = new Map<string, { count: number; totalQueryTime: number; totalQueries: number }>()
  for (const p of pageLoads) {
    const e = byPath.get(p.path) ?? { count: 0, totalQueryTime: 0, totalQueries: 0 }
    e.count++
    e.totalQueryTime += p.queryTimeMs
    e.totalQueries += p.queryCount
    byPath.set(p.path, e)
  }
  const paginasMaisLentas = [...byPath.entries()]
    .map(([path, e]) => ({ path, visitas: e.count, tempoMedioMs: e.totalQueryTime / e.count, queriesMedia: e.totalQueries / e.count }))
    .sort((a, b) => b.tempoMedioMs - a.tempoMedioMs)
    .slice(0, 15)

  // ── Queries mais lentas (individuais) ────────────────────────────────────
  const queriesMaisLentas = [...queries].sort((a, b) => b.durationMs - a.durationMs).slice(0, 20)

  // ── Componentes que mais renderizam ──────────────────────────────────────
  const byComponent = new Map<string, { count: number; totalMs: number; maxMs: number; over16: number }>()
  for (const r of renders) {
    const e = byComponent.get(r.id) ?? { count: 0, totalMs: 0, maxMs: 0, over16: 0 }
    e.count++
    e.totalMs += r.actualDuration
    e.maxMs = Math.max(e.maxMs, r.actualDuration)
    if (r.actualDuration > 16) e.over16++
    byComponent.set(r.id, e)
  }
  const componentesQueMaisRenderizam = [...byComponent.entries()]
    .map(([id, e]) => ({ id, renders: e.count, tempoMedioMs: e.totalMs / e.count, tempoMaxMs: e.maxMs, acimaDe16ms: e.over16 }))
    .sort((a, b) => b.renders - a.renders)
    .slice(0, 15)

  // ── Estatísticas por tabela (leituras vs escritas) ───────────────────────
  const byTable = new Map<string, { reads: number; writes: number; totalMs: number; totalRows: number }>()
  for (const q of queries) {
    const e = byTable.get(q.table) ?? { reads: 0, writes: 0, totalMs: 0, totalRows: 0 }
    if (q.method === 'GET') e.reads++
    else e.writes++
    e.totalMs += q.durationMs
    e.totalRows += q.rows ?? 0
    byTable.set(q.table, e)
  }
  const estatisticasPorTabela = [...byTable.entries()]
    .map(([table, e]) => ({ table, leituras: e.reads, escritas: e.writes, tempoTotalMs: e.totalMs, linhasLidas: e.totalRows }))
    .sort((a, b) => (b.leituras + b.escritas) - (a.leituras + a.escritas))

  // ── Web Vitals (média por métrica) ───────────────────────────────────────
  const byVital = new Map<string, number[]>()
  for (const v of vitals) {
    const arr = byVital.get(v.name) ?? []
    arr.push(v.value)
    byVital.set(v.name, arr)
  }
  const webVitals = [...byVital.entries()].map(([name, values]) => ({
    name, amostras: values.length, media: avg(values), p75: values.slice().sort((a, b) => a - b)[Math.floor(values.length * 0.75)] ?? 0,
  }))

  // ── Cache hit/miss (aproximado): navegação sem PageLoad correspondente em
  // até 800ms = serviu do Router Cache do navegador, servidor nem rodou. ────
  let hits = 0, misses = 0
  const navTimeToServer: number[] = []
  for (const n of navs) {
    const match = pageLoads.find(p => p.path === n.path && p.timestamp >= n.timestamp && p.timestamp - n.timestamp < 800)
    if (match) { misses++; navTimeToServer.push(match.timestamp - n.timestamp) }
    else hits++
  }

  const totalQueries = queries.length
  const mediaQueriesPorPagina = avg(pageLoads.map(p => p.queryCount))
  const mediaTempoQueryMs = avg(queries.map(q => q.durationMs))

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 font-mono text-sm">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">/dev/performance</h1>
          <p className="text-gray-500">
            Instrumentação dev-only — dados coletados desde o último restart do servidor
            ({queries.length} queries, {renders.length} renders, {navs.length} navegações, {vitals.length} vitals amostrados).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AutoRefresh />
          <ClearButton />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Queries totais" value={String(totalQueries)} />
        <Stat label="Média queries/página" value={mediaQueriesPorPagina.toFixed(1)} />
        <Stat label="Tempo médio/query" value={fmtMs(mediaTempoQueryMs)} />
        <Stat label="Cache hits (Router Cache, aprox.)" value={`${hits} / ${hits + misses}`} hint={hits + misses > 0 ? `${((hits / (hits + misses)) * 100).toFixed(0)}%` : undefined} />
      </section>

      <Section title="Páginas mais lentas (tempo médio de queries por visita)">
        <Table headers={['Página', 'Visitas', 'Tempo médio', 'Queries (média)']}>
          {paginasMaisLentas.map(p => (
            <tr key={p.path} className="border-t border-gray-100">
              <td className="py-1.5 pr-3">{p.path}</td>
              <td className="py-1.5 pr-3">{p.visitas}</td>
              <td className={`py-1.5 pr-3 ${p.tempoMedioMs > 500 ? 'text-red-600 font-semibold' : p.tempoMedioMs > 200 ? 'text-amber-600' : ''}`}>{fmtMs(p.tempoMedioMs)}</td>
              <td className="py-1.5">{p.queriesMedia.toFixed(1)}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Queries mais lentas (individuais, top 20)">
        <Table headers={['Tabela', 'Método', 'Duração', 'Linhas', 'Página']}>
          {queriesMaisLentas.map((q, i) => (
            <tr key={i} className="border-t border-gray-100">
              <td className="py-1.5 pr-3">{q.table}</td>
              <td className="py-1.5 pr-3">{q.method}</td>
              <td className={`py-1.5 pr-3 ${q.durationMs > 250 ? 'text-red-600 font-semibold' : q.durationMs > 100 ? 'text-amber-600' : q.durationMs > 50 ? 'text-yellow-600' : ''}`}>{fmtMs(q.durationMs)}</td>
              <td className="py-1.5 pr-3">{q.rows ?? '—'}</td>
              <td className="py-1.5">{q.path ?? '—'}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Componentes que mais renderizam">
        <Table headers={['Componente', 'Renders', 'Tempo médio', 'Tempo máx.', '>16ms']}>
          {componentesQueMaisRenderizam.map(c => (
            <tr key={c.id} className="border-t border-gray-100">
              <td className="py-1.5 pr-3">{c.id}</td>
              <td className="py-1.5 pr-3">{c.renders}</td>
              <td className="py-1.5 pr-3">{fmtMs(c.tempoMedioMs)}</td>
              <td className={`py-1.5 pr-3 ${c.tempoMaxMs > 16 ? 'text-amber-600' : ''}`}>{fmtMs(c.tempoMaxMs)}</td>
              <td className="py-1.5">{c.acimaDe16ms}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Estatísticas por tabela (leituras/escritas)">
        <Table headers={['Tabela', 'Leituras', 'Escritas', 'Tempo total', 'Linhas lidas']}>
          {estatisticasPorTabela.map(t => (
            <tr key={t.table} className="border-t border-gray-100">
              <td className="py-1.5 pr-3">{t.table}</td>
              <td className="py-1.5 pr-3">{t.leituras}</td>
              <td className="py-1.5 pr-3">{t.escritas}</td>
              <td className="py-1.5 pr-3">{fmtMs(t.tempoTotalMs)}</td>
              <td className="py-1.5">{t.linhasLidas}</td>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Web Vitals (LCP/CLS/INP/TTFB/FCP)">
        <Table headers={['Métrica', 'Amostras', 'Média', 'P75']}>
          {webVitals.map(v => (
            <tr key={v.name} className="border-t border-gray-100">
              <td className="py-1.5 pr-3">{v.name}</td>
              <td className="py-1.5 pr-3">{v.amostras}</td>
              <td className="py-1.5 pr-3">{v.name === 'CLS' ? v.media.toFixed(3) : fmtMs(v.media)}</td>
              <td className="py-1.5">{v.name === 'CLS' ? v.p75.toFixed(3) : fmtMs(v.p75)}</td>
            </tr>
          ))}
        </Table>
        {webVitals.length === 0 && (
          <p className="mt-2 text-xs text-gray-400">Nenhuma amostra ainda — navegue pelo app numa aba real (Web Vitals não são coletados em requisições automatizadas/headless sem interação).</p>
        )}
      </Section>

      <p className="text-xs text-gray-400">
        Cache hit/miss é uma estimativa: compara navegações observadas no cliente (troca de pathname)
        com cargas observadas no servidor (query-stats). Sem carga no servidor em ~800ms = o Router
        Cache (staleTimes) serviu a página sem round-trip — o servidor não chega a ser acionado nesse
        caso, então não existe uma forma de medir isso diretamente no backend.
      </p>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}{hint && <span className="ml-1 text-xs font-normal text-gray-400">({hint})</span>}</p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500">{title}</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white p-3">{children}</div>
    </section>
  )
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="text-gray-400">
          {headers.map(h => <th key={h} className="pb-1.5 pr-3 font-medium">{h}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  )
}
