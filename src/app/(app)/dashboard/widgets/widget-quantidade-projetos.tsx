import { createClient } from '@/lib/supabase/server'
import { WidgetCard } from './widget-card'

export async function WidgetQuantidadeProjetos() {
  let total = 0
  try {
    const sb = (await createClient()) as any
    const { count } = await sb.from('tabela_orcamentos').select('id', { count: 'exact', head: true })
    total = count ?? 0
  } catch {
    // mantém 0
  }

  return (
    <WidgetCard title="Projetos" href="/orcamentos">
      <p className="text-3xl font-bold text-gray-900 tabular-nums">{total}</p>
      <p className="text-xs text-gray-400 mt-1">orçamento{total !== 1 ? 's' : ''} cadastrado{total !== 1 ? 's' : ''}</p>
    </WidgetCard>
  )
}
