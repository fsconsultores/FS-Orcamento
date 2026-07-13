import { createClient } from '@/lib/supabase/server'
import type { OrcamentoVersaoResumo } from '@/lib/orcamento/versoes'
import { VersoesView } from './versoes-view'

export default async function VersoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const sb = supabase as any

  const [{ data, error }, { data: { user } }] = await Promise.all([
    sb
      .from('orcamento_versoes')
      .select('id, mensagem, autor_email, criado_em, origem')
      .eq('orcamento_id', orcamentoId)
      .order('criado_em', { ascending: false }),
    supabase.auth.getUser(),
  ])

  const versoes = (data ?? []) as OrcamentoVersaoResumo[]

  return (
    <VersoesView
      orcamentoId={orcamentoId}
      versoesIniciais={versoes}
      fetchError={error?.message}
      usuarioAtualEmail={user?.email ?? null}
    />
  )
}
