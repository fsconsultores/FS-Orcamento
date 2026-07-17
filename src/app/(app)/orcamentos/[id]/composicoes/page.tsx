import { createClient } from '@/lib/supabase/server'
import { getComposicoesByOrcamentoDetalhado, calcularCodigosUtilizados } from '@/lib/orcamento'
import { ComposicoesTable } from './composicoes-table'
import { DevProfiler } from '@/components/dev-profiler'
import { ExportComposicoesButton } from '@/components/export-composicoes-button'
import { ExportComposicaoModeloButton } from '@/components/export-composicao-modelo-button'
import type { OrcamentoComposicao } from '@/lib/orcamento'
import type { ComposicaoParaExport } from '@/components/export-composicoes-button'

export default async function OrcamentoComposicoesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const sb = supabase as any

  // getComposicoesByOrcamentoDetalhado já busca internamente os insumos de
  // cada composição (pra calcular custo_unitario) — reaproveitado aqui em
  // vez de rodar uma segunda varredura própria de orcamento_insumos.
  const [{ composicoes, insumosDeComposicao }, { data: estrutura }] = await Promise.all([
    getComposicoesByOrcamentoDetalhado(sb, orcamentoId),
    sb.from('orcamento_estrutura').select('codigo').eq('orcamento_id', orcamentoId).eq('tipo', 'item'),
  ])

  const codigosUtilizados = calcularCodigosUtilizados(
    (estrutura ?? []).map((e: { codigo: string | null }) => e.codigo),
    composicoes.map((c: OrcamentoComposicao) => ({ id: c.id, codigo: c.codigo })),
    insumosDeComposicao
  )

  // Monta o mapa de insumos por composição para o export a partir do mesmo
  // dado já buscado acima (servidor, sem query adicional e sem query no cliente)
  const insumosPorComp: Record<string, ComposicaoParaExport['insumos']> = {}
  for (const ins of insumosDeComposicao) {
    if (!insumosPorComp[ins.composicao_id]) insumosPorComp[ins.composicao_id] = []
    insumosPorComp[ins.composicao_id]!.push({
      codigo: ins.codigo ?? '',
      descricao: ins.descricao ?? '',
      unidade: ins.unidade ?? '',
      custo: ins.custo ?? 0,
      indice: ins.indice ?? 0,
      grupo: ins.grupo ?? null,
    })
  }

  const composicoesParaExport: ComposicaoParaExport[] = composicoes.map((c: OrcamentoComposicao) => ({
    id: c.id,
    codigo: c.codigo,
    descricao: c.descricao,
    unidade: c.unidade,
    custo_unitario: c.custo_unitario,
    insumos: insumosPorComp[c.id] ?? [],
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Composições do Orçamento</h1>
          <p className="text-sm text-gray-500 mt-1">{composicoes.length} composição(ões)</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportComposicaoModeloButton />
          <ExportComposicoesButton composicoes={composicoesParaExport} />
        </div>
      </div>

      <DevProfiler id="ComposicoesTable">
        <ComposicoesTable composicoes={composicoes} orcamentoId={orcamentoId} codigosUtilizados={[...codigosUtilizados]} />
      </DevProfiler>
    </div>
  )
}
