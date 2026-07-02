import { createClient } from '@/lib/supabase/server'
import { PlanilhaView } from './planilha-view'
import { ImportPlanilhaForm } from './import-planilha-form'
import { getOrCreateDefaultPlanilha, getPlanilhasByOrcamento } from '@/lib/orcamento/planilhas'
import type { EstruturaItem } from './planilha-action'

export default async function PlanilhaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ planilha?: string }>
}) {
  const { id: orcamentoId } = await params
  const { planilha: planilhaParam } = await searchParams
  const supabase = await createClient()
  const sb = supabase as any

  // Garante que o orçamento tenha ao menos uma planilha (retrocompatibilidade)
  const defaultPlanilha = await getOrCreateDefaultPlanilha(sb, orcamentoId)
  const todasPlanilhas  = await getPlanilhasByOrcamento(sb, orcamentoId)

  // Planilha ativa: prioriza param da URL, cai para a primeira
  const activePlanilha = todasPlanilhas.find(p => p.id === planilhaParam) ?? defaultPlanilha

  const [{ data }, { data: orc }, { data: config }] = await Promise.all([
    sb.from('orcamento_estrutura')
      .select('id, parent_id, planilha_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem')
      .eq('orcamento_id', orcamentoId)
      .eq('planilha_id', activePlanilha.id)
      .order('nivel', { ascending: true })
      .order('ordem', { ascending: true }),
    sb.from('tabela_orcamentos')
      .select('nome_obra, codigo, cliente, data, bdi_global')
      .eq('id', orcamentoId)
      .single(),
    sb.from('tabela_orcamentos')
      .select('numeracao_digitos')
      .eq('id', orcamentoId)
      .single(),
  ])

  const items: EstruturaItem[] = data ?? []
  const nomeOrcamento: string = orc ? `${orc.codigo} - ${orc.nome_obra}` : orcamentoId
  const numeracaoDigitos: number[] = config?.numeracao_digitos ?? [1, 1, 1, 1]
  const bdiGlobal: number = activePlanilha.bdi_global ?? orc?.bdi_global ?? 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-gray-900">Planilha Orçamentária</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {activePlanilha.nome}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {items.length === 0
              ? 'Nenhum item. Importe um CSV ou adicione manualmente.'
              : `${items.filter(i => i.tipo === 'item').length} item(ns) em ${items.filter(i => i.tipo === 'grupo').length} grupo(s)`}
          </p>
        </div>
        <ImportPlanilhaForm orcamentoId={orcamentoId} planilhaId={activePlanilha.id} />
      </div>

      <PlanilhaView
        initialItems={items}
        orcamentoId={orcamentoId}
        nomeOrcamento={nomeOrcamento}
        nomePlanilha={activePlanilha.nome}
        bdiGlobal={bdiGlobal}
        cliente={orc?.cliente ?? null}
        dataOrcamento={orc?.data ?? null}
        numeracaoDigitos={numeracaoDigitos}
        activePlanilhaId={activePlanilha.id}
      />
    </div>
  )
}
