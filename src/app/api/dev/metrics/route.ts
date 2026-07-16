import { NextResponse } from 'next/server'
import { recordRenderMetric, recordVitalMetric, recordNavMetric, type RenderMetric, type VitalMetric, type NavMetric } from '@/lib/dev-metrics/store'

/**
 * Recebe em lote métricas coletadas no cliente (renders do Profiler, Web
 * Vitals) e alimenta o mesmo store em memória usado pelas queries do
 * servidor — assim o dashboard /dev/performance mostra tudo num lugar só.
 * 404 fora de desenvolvimento: não existe rota nenhuma em produção.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const body = (await req.json().catch(() => null)) as { renders?: RenderMetric[]; vitals?: VitalMetric[]; navs?: NavMetric[] } | null
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  for (const r of body.renders ?? []) recordRenderMetric(r)
  for (const v of body.vitals ?? []) recordVitalMetric(v)
  for (const n of body.navs ?? []) recordNavMetric(n)

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ error: 'not found' }, { status: 404 })
}
