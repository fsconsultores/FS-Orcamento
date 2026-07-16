import { notFound } from 'next/navigation'
import { PlanilhasPicker } from './planilhas-picker'
import { getPlanilhasEnsuredCached } from '@/lib/orcamento/planilhas-server'
import { getOrcamentoHeaderCached } from '@/lib/orcamento/orcamento-header'

export default async function OrcamentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Mesma consulta já feita pelo layout desta rota — memoizada por
  // requisição (React cache) para não repetir o SELECT.
  const orc = await getOrcamentoHeaderCached(id)
  if (!orc) notFound()

  // Retrocompatibilidade: orçamentos criados antes do suporte a múltiplas
  // planilhas ainda não têm nenhuma linha em orcamento_planilhas. Garante que
  // ao menos a "Planilha Principal" exista antes de listar. Mesma consulta já
  // feita pelo layout — memoizada por requisição, não repete o round-trip.
  let planilhas: { id: string; nome: string; bdi_global: number; ordem: number }[] = []
  try {
    planilhas = await getPlanilhasEnsuredCached(id)
  } catch {}

  return (
    <PlanilhasPicker
      orcamentoId={id}
      nomeObra={orc.nome_obra}
      planilhas={planilhas}
    />
  )
}
