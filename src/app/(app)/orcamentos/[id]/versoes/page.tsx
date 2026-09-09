import { createClient } from '@/lib/supabase/server'
import { listarRevisoes } from '@/lib/orcamento/revisoes'
import { VersoesView } from './versoes-view'

export default async function VersoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const sb = supabase as any

  const [{ data: orcamento }, revisoesResult] = await Promise.all([
    sb.from('tabela_orcamentos').select('nome_obra').eq('id', orcamentoId).single(),
    listarRevisoes(supabase, orcamentoId).catch(() => null),
  ])

  return (
    <VersoesView
      orcamentoId={orcamentoId}
      orcamentoNome={orcamento?.nome_obra ?? ''}
      revisoesIniciais={revisoesResult ?? []}
      revisoesFetchError={revisoesResult === null ? 'A migração de revisões ainda não foi aplicada neste banco.' : undefined}
    />
  )
}
