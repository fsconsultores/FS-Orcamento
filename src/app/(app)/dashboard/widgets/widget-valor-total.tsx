import { createClient } from '@/lib/supabase/server'
import { WidgetCard } from './widget-card'

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export async function WidgetValorTotal() {
  let totalComBdi = 0
  let totalSemBdi = 0
  try {
    const sb = (await createClient()) as any
    const { data } = await sb.from('orcamento_planilhas').select('total_custo, total_com_bdi')
    for (const p of (data ?? []) as { total_custo: number | null; total_com_bdi: number | null }[]) {
      totalSemBdi += p.total_custo ?? 0
      totalComBdi += p.total_com_bdi ?? 0
    }
  } catch {
    // mantém 0
  }

  return (
    <WidgetCard title="Valor total dos orçamentos">
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{fmt(totalComBdi)}</p>
      <p className="text-xs text-gray-400 mt-1">{fmt(totalSemBdi)} sem BDI · soma de todas as planilhas</p>
    </WidgetCard>
  )
}
