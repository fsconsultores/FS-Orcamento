import { createClient } from '@/lib/supabase/server'
import { getLevantamentosByOrcamento } from '@/lib/orcamento/levantamentos'
import { PageHeader } from '@/components/ui/toolbar'
import { LevantamentosManager } from './levantamentos-manager'

export default async function LevantamentosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const levantamentos = await getLevantamentosByOrcamento(supabase, orcamentoId)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Levantamentos"
        description="O que existe na obra e quanto — separado da precificação. Controle por área, com checklist e pendências."
      />
      <LevantamentosManager orcamentoId={orcamentoId} initialLevantamentos={levantamentos} />
    </div>
  )
}
