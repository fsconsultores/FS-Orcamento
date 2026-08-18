import { createClient } from '@/lib/supabase/server'
import { getCadernoData } from '@/lib/orcamento'
import { getPlanilhasEnsuredCached } from '@/lib/orcamento/planilhas-server'
import { RelatoriosView } from './relatorios-view'
import type { EscopoPlanilha } from './filters/planilha-selector'

export default async function RelatoriosPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id: orcamentoId } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const planilhaAtualId = typeof sp.planilha === 'string' ? sp.planilha : null
  // Sem escolha explícita de escopo: acompanha a planilha ativa (seletor no
  // topo) em vez de sempre agregar todas — consistente com as outras abas.
  const escopoParam = typeof sp.escopo === 'string' ? sp.escopo : (planilhaAtualId ? 'atual' : 'todas')
  const escopo: EscopoPlanilha = escopoParam === 'atual' || escopoParam === 'selecionar' ? escopoParam : 'todas'
  const planilhasParam = typeof sp.planilhas === 'string' ? sp.planilhas : ''
  const planilhaIdsSelecionadas = planilhasParam ? planilhasParam.split(',').filter(Boolean) : []

  const planilhaIdsParaQuery: string[] | null =
    escopo === 'atual' ? (planilhaAtualId ? [planilhaAtualId] : null)
    : escopo === 'selecionar' ? (planilhaIdsSelecionadas.length > 0 ? planilhaIdsSelecionadas : null)
    : null

  const [data, planilhas, { data: servicosManuais }] = await Promise.all([
    getCadernoData(supabase as any, orcamentoId, planilhaIdsParaQuery),
    getPlanilhasEnsuredCached(orcamentoId),
    (supabase as any).from('orcamento_servicos_estimados')
      .select('id, descricao, valor')
      .eq('orcamento_id', orcamentoId)
      .order('ordem', { ascending: true }),
  ])

  return (
    <RelatoriosView
      orcamentoId={orcamentoId}
      data={data}
      planilhas={planilhas.map(p => ({ id: p.id, nome: p.nome }))}
      planilhaAtualId={planilhaAtualId}
      escopo={escopo}
      planilhaIds={escopo === 'selecionar' ? planilhaIdsSelecionadas : planilhaAtualId ? [planilhaAtualId] : []}
      servicosEstimadosManuais={(servicosManuais ?? []).map((s: any) => ({ id: s.id, descricao: s.descricao, valor: s.valor }))}
    />
  )
}
