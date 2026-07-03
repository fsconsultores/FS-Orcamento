import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PlanilhasPicker } from './planilhas-picker'
import { getOrCreateDefaultPlanilha, getPlanilhasByOrcamento } from '@/lib/orcamento/planilhas'

export default async function OrcamentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sb = (await createClient()) as any

  const { data: orc } = await sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, codigo, cliente, data')
    .eq('id', id)
    .single()

  if (!orc) notFound()

  // Retrocompatibilidade: orçamentos criados antes do suporte a múltiplas
  // planilhas ainda não têm nenhuma linha em orcamento_planilhas. Garante que
  // ao menos a "Planilha Principal" exista antes de listar.
  let planilhas: { id: string; nome: string; bdi_global: number; ordem: number }[] = []
  try {
    await getOrCreateDefaultPlanilha(sb, id)
    planilhas = await getPlanilhasByOrcamento(sb, id)
  } catch {}

  return (
    <PlanilhasPicker
      orcamentoId={id}
      nomeObra={orc.nome_obra}
      planilhas={planilhas}
    />
  )
}
