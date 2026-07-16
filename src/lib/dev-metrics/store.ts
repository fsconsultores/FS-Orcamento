/**
 * Store de métricas em memória, dev-only. O processo do `next dev` é
 * long-lived, então uma variável de módulo persiste entre requisições — não
 * precisa de Redis/DB para uma ferramenta interna de desenvolvimento. Cada
 * lista é um ring buffer (corta as mais antigas) para não crescer sem limite
 * numa sessão longa de dev.
 *
 * Nunca importar isto fora de código dev-only — não existe proteção de
 * "produção" aqui além da que os call sites já fazem (checam NODE_ENV antes
 * de chamar record*).
 */

export interface QueryMetric {
  table: string
  method: string
  durationMs: number
  rows: number | null
  path: string | null
  timestamp: number
}

export interface RenderMetric {
  id: string
  phase: 'mount' | 'update' | 'nested-update'
  actualDuration: number
  path: string | null
  timestamp: number
}

export interface VitalMetric {
  name: string
  value: number
  path: string
  timestamp: number
}

export interface PageLoadMetric {
  path: string
  queryCount: number
  queryTimeMs: number
  timestamp: number
}

/**
 * Navegação observada no CLIENTE (troca de pathname). Comparada com
 * PageLoadMetric (observado no SERVIDOR) para estimar cache hit/miss do
 * Router Cache: uma navegação sem PageLoadMetric correspondente em ~800ms
 * significa que o servidor nem chegou a rodar — o payload veio do cache do
 * navegador (staleTimes). Não dá pra saber isso só olhando o servidor,
 * porque nesse caso o servidor literalmente não recebe requisição nenhuma.
 */
export interface NavMetric {
  path: string
  timestamp: number
}

const LIMIT = 1000

function ringPush<T>(arr: T[], item: T, limit = LIMIT) {
  arr.push(item)
  if (arr.length > limit) arr.splice(0, arr.length - limit)
}

// globalThis (não módulo simples) para sobreviver a recompilações do
// Turbopack/HMR, que podem reexecutar o módulo mas não limpam globalThis.
const g = globalThis as unknown as {
  __devMetrics?: {
    queries: QueryMetric[]
    renders: RenderMetric[]
    vitals: VitalMetric[]
    pageLoads: PageLoadMetric[]
    navs: NavMetric[]
  }
}

const state = (g.__devMetrics ??= { queries: [], renders: [], vitals: [], pageLoads: [], navs: [] })

export function recordQueryMetric(m: QueryMetric) {
  ringPush(state.queries, m)
}
export function recordRenderMetric(m: RenderMetric) {
  ringPush(state.renders, m)
}
export function recordVitalMetric(m: VitalMetric) {
  ringPush(state.vitals, m)
}
export function recordPageLoadMetric(m: PageLoadMetric) {
  ringPush(state.pageLoads, m)
}
export function recordNavMetric(m: NavMetric) {
  ringPush(state.navs, m)
}

export function getMetricsSnapshot() {
  return {
    queries: [...state.queries],
    renders: [...state.renders],
    vitals: [...state.vitals],
    pageLoads: [...state.pageLoads],
    navs: [...state.navs],
  }
}

export function clearMetrics() {
  state.queries.length = 0
  state.renders.length = 0
  state.vitals.length = 0
  state.pageLoads.length = 0
  state.navs.length = 0
}
