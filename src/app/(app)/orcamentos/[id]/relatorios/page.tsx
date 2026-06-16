import { createClient } from '@/lib/supabase/server'
import { getCadernoData } from '@/lib/orcamento'
import { RelatoriosView } from './relatorios-view'

export default async function RelatoriosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const data = await getCadernoData(supabase as any, orcamentoId)
  return <RelatoriosView data={data} />
}
