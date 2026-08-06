import { createClient } from '@/lib/supabase/server'
import { getCadernoData } from '@/lib/orcamento/caderno'
import { PageHeader } from '@/components/ui/toolbar'
import { EstimadosManager } from './estimados-manager'

export default async function EstimadosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const data = await getCadernoData(supabase, orcamentoId, null, { incluirEstimadosNaArvore: true })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Estimados"
        description="Escolha quais itens da planilha entram em 'Serviços Estimados (B)' no Caderno de Orçamento e demais relatórios."
      />
      <EstimadosManager orcamentoId={orcamentoId} arvore={data.arvore} totalGeral={data.totalGeral} />
    </div>
  )
}
