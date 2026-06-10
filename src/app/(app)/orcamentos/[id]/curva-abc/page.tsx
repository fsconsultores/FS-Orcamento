import { createClient } from '@/lib/supabase/server'
import { computeAbcCurves, type EstruturaItemBasico, type InsumoComposicaoBasico } from '@/lib/curva-abc'
import { CurvaAbcView } from './curva-abc-view'

export default async function CurvaAbcPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const sb = supabase as any

  // 1. Orçamento + planilha + composições em paralelo
  const [{ data: orcamento }, { data: estrutura }, { data: composicoes }] = await Promise.all([
    sb.from('tabela_orcamentos')
      .select('nome_obra')
      .eq('id', orcamentoId)
      .single(),
    sb.from('orcamento_estrutura')
      .select('codigo, descricao, unidade, quantidade, custo_unitario')
      .eq('orcamento_id', orcamentoId)
      .eq('tipo', 'item'),
    sb.from('orcamento_composicoes')
      .select('id, codigo')
      .eq('orcamento_id', orcamentoId),
  ])

  const estItems: EstruturaItemBasico[] = estrutura ?? []

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

  const { abcServicos, abcInsumos } = computeAbcCurves(estItems, composicoes ?? [], allInsumos)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Curva ABC</h1>
        <p className="text-sm text-gray-500 mt-1">
          Classificação dos itens por impacto financeiro no orçamento.
        </p>
      </div>
      <CurvaAbcView abcServicos={abcServicos} abcInsumos={abcInsumos} orcamentoNome={orcamento?.nome_obra} />
    </div>
  )
}
