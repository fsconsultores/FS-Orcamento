import { createClient } from '@/lib/supabase/server'
import { PlanilhaView } from './planilha-view'
import { ImportPlanilhaForm } from './import-planilha-form'
import { getPlanilhasEnsuredCached } from '@/lib/orcamento/planilhas-server'
import { DevProfiler } from '@/components/dev-profiler'
import type { EstruturaItem } from './planilha-crud-action'
import { getTaxaAdministracaoItens, type ModeloAcrescimo } from '@/lib/orcamento/modelo-acrescimo'

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

  // Garante que o orçamento tenha ao menos uma planilha (retrocompatibilidade).
  // Memoizado por requisição — o layout desta rota já chamou isso.
  const todasPlanilhas = await getPlanilhasEnsuredCached(orcamentoId)

  // Planilha ativa: prioriza param da URL, cai para a primeira
  const activePlanilha = todasPlanilhas.find(p => p.id === planilhaParam) ?? todasPlanilhas[0]

  const [{ data }, { data: orc }, { data: config }, taxaAdministracaoItens] = await Promise.all([
    sb.from('orcamento_estrutura')
      .select('id, parent_id, planilha_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem, eh_taxa_administracao')
      .eq('orcamento_id', orcamentoId)
      .eq('planilha_id', activePlanilha.id)
      .order('nivel', { ascending: true })
      .order('ordem', { ascending: true }),
    sb.from('tabela_orcamentos')
      .select('nome_obra, codigo, cliente, data, bdi_global, modelo_acrescimo')
      .eq('id', orcamentoId)
      .single(),
    sb.from('tabela_orcamentos')
      .select('numeracao_digitos')
      .eq('id', orcamentoId)
      .single(),
    getTaxaAdministracaoItens(supabase, orcamentoId),
  ])

  const items: EstruturaItem[] = data ?? []
  const nomeOrcamento: string = orc ? `${orc.codigo} - ${orc.nome_obra}` : orcamentoId
  const numeracaoDigitos: number[] = config?.numeracao_digitos ?? [1, 1, 1, 1]
  const bdiGlobal: number = activePlanilha.bdi_global ?? orc?.bdi_global ?? 0
  const modeloAcrescimo: ModeloAcrescimo = orc?.modelo_acrescimo ?? 'bdi'
  // Todos os subgrupos aplicam o percentual sobre a mesma base — a soma deles
  // é a taxa efetiva combinada do grupo "Taxa de Administração" (só pra
  // exibição no card; o cálculo real soma cada subgrupo individualmente).
  const taxaAdministracaoPercentual: number = taxaAdministracaoItens.reduce((acc, it) => acc + it.percentual, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Planilha Orçamentária</h1>
          <p className="text-sm text-gray-500 mt-1">
            {items.length === 0
              ? 'Nenhum item. Importe um CSV ou adicione manualmente.'
              : `${items.filter(i => i.tipo === 'item').length} item(ns) em ${items.filter(i => i.tipo === 'grupo').length} grupo(s)`}
          </p>
        </div>
        <ImportPlanilhaForm orcamentoId={orcamentoId} planilhaId={activePlanilha.id} />
      </div>

      <DevProfiler id="PlanilhaView">
        <PlanilhaView
          initialItems={items}
          orcamentoId={orcamentoId}
          nomeOrcamento={nomeOrcamento}
          nomePlanilha={activePlanilha.nome}
          bdiGlobal={bdiGlobal}
          modeloAcrescimo={modeloAcrescimo}
          taxaAdministracaoPercentual={taxaAdministracaoPercentual}
          cliente={orc?.cliente ?? null}
          dataOrcamento={orc?.data ?? null}
          numeracaoDigitos={numeracaoDigitos}
          activePlanilhaId={activePlanilha.id}
        />
      </DevProfiler>
    </div>
  )
}
