import { createClient } from '@/lib/supabase/server'
import { WidgetStat } from './widget-card'
import { IconBuilding } from './icons'

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
    <WidgetStat
      title="Projetos"
      href="/orcamentos"
      icon={<IconBuilding />}
      value={total}
      caption={`orçamento${total !== 1 ? 's' : ''} cadastrado${total !== 1 ? 's' : ''}`}
    />
  )
}
