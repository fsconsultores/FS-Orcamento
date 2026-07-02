import { createClient } from '@/lib/supabase/server'
import { LogsView } from './logs-view'

export default async function LogsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ acao?: string; q?: string }>
}) {
  const { id: orcamentoId } = await params
  const { acao, q } = await searchParams
  const sb = (await createClient()) as any

  let query = sb
    .from('orcamento_logs')
    .select('id, planilha_id, user_id, acao, mensagem, detalhes, created_at, orcamento_planilhas(nome)')
    .eq('orcamento_id', orcamentoId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (acao) query = query.eq('acao', acao)
  if (q)    query = query.ilike('mensagem', `%${q}%`)

  const { data: logs } = await query

  return <LogsView orcamentoId={orcamentoId} logs={logs ?? []} filtroAcao={acao ?? ''} filtroQ={q ?? ''} />
}
