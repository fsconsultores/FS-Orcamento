import { createClient } from '@/lib/supabase/server'
import { computeAbcCurvaUnica, computeIdsEstimados, type EstruturaItemBasico, type InsumoComposicaoBasico, type InsumoAvulsoBasico } from '@/lib/curva-abc'
import { CurvaAbcView } from './curva-abc-view'
import { PageHeader } from '@/components/ui/toolbar'
import { getPlanilhasEnsuredCached } from '@/lib/orcamento/planilhas-server'
import { DevProfiler } from '@/components/dev-profiler'

export default async function CurvaAbcPage({
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

  // Mesma resolução de planilha ativa da Planilha — a Curva ABC mostra só os
  // itens da planilha selecionada no seletor, não o orçamento inteiro.
  // Memoizado por requisição — o layout desta rota já chamou isso.
  const todasPlanilhas = await getPlanilhasEnsuredCached(orcamentoId)
  const activePlanilha = todasPlanilhas.find(p => p.id === planilhaParam) ?? todasPlanilhas[0]

  // 1. Orçamento + planilha + composições em paralelo
  const [{ data: orcamento }, { data: estrutura }, { data: composicoes }] = await Promise.all([
    sb.from('tabela_orcamentos')
      .select('nome_obra, bdi_global')
      .eq('id', orcamentoId)
      .single(),
    sb.from('orcamento_estrutura')
      .select('id, parent_id, tipo, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, estimado')
      .eq('orcamento_id', orcamentoId)
      .eq('planilha_id', activePlanilha.id),
    sb.from('orcamento_composicoes')
      .select('id, codigo, descricao')
      .eq('orcamento_id', orcamentoId),
  ])

  // Itens marcados como "Estimado" (aba Estimados) — ou descendentes de um
  // grupo marcado — não são custo real do orçamento e não podem entrar no
  // ranking/percentuais da Curva ABC (mesmo critério de getCadernoData, ver
  // computeIdsEstimados). Sem isso, esta página e a Curva ABC dentro do
  // Caderno mostrariam classificações A/B/C diferentes pro mesmo orçamento.
  const estruturaFull = estrutura ?? []
  const idsEstimados = computeIdsEstimados(
    estruturaFull.map((e: any) => ({ id: e.id, parent_id: e.parent_id, estimado: e.estimado ?? false }))
  )
  // bdi_especifico do item > bdi_global da planilha ativa > bdi_global do
  // orçamento — mesma cadeia usada por getCadernoData() pra "(A) Total
  // Orçado", pra Curva ABC nunca divergir dele por causa do BDI.
  const estItems: EstruturaItemBasico[] = estruturaFull
    .filter((e: any) => e.tipo === 'item' && !idsEstimados.has(e.id))
    .map((e: any) => ({
      codigo: e.codigo,
      descricao: e.descricao,
      unidade: e.unidade,
      quantidade: e.quantidade,
      custo_unitario: e.custo_unitario,
      bdiPercentual: e.bdi_especifico ?? activePlanilha.bdi_global ?? orcamento?.bdi_global ?? 0,
    }))

  // 2. Insumos dentro de composições (paginado) — necessário antes do split
  const allInsumos: InsumoComposicaoBasico[] = []
  {
    const BATCH = 1000
    let start = 0
    while (true) {
      const { data } = await sb
        .from('orcamento_insumos')
        .select('codigo, descricao, unidade, custo, indice, composicao_id, grupo')
        .eq('orcamento_id', orcamentoId)
        .not('composicao_id', 'is', null)
        .range(start, start + BATCH - 1)
      if (!data || data.length === 0) break
      allInsumos.push(...data)
      if (data.length < BATCH) break
      start += BATCH
    }
  }

  // 3. Insumos avulsos (composicao_id null) — usados para mapear itens diretos
  // da planilha com código não-"I" para o código "I" real correspondente
  const insumosAvulsos: InsumoAvulsoBasico[] = []
  {
    const BATCH = 1000
    let start = 0
    while (true) {
      const { data } = await sb
        .from('orcamento_insumos')
        .select('codigo, descricao, custo, grupo')
        .eq('orcamento_id', orcamentoId)
        .is('composicao_id', null)
        .range(start, start + BATCH - 1)
      if (!data || data.length === 0) break
      insumosAvulsos.push(...data)
      if (data.length < BATCH) break
      start += BATCH
    }
  }

  const items = computeAbcCurvaUnica(estItems, composicoes ?? [], allInsumos, insumosAvulsos)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Curva ABC"
        description={`Classificação dos itens por impacto financeiro na planilha "${activePlanilha.nome}".`}
      />
      <DevProfiler id="CurvaAbcView">
        <CurvaAbcView orcamentoId={orcamentoId} items={items} orcamentoNome={orcamento?.nome_obra} />
      </DevProfiler>
    </div>
  )
}
