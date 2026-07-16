import { createClient } from '@/lib/supabase/server'
import { getComposicoesByOrcamento, calcularCodigosUtilizados } from '@/lib/orcamento'
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

  const composicoes = await getComposicoesByOrcamento(sb, orcamentoId)

  const { data: estrutura } = await sb
    .from('orcamento_estrutura')
    .select('codigo')
    .eq('orcamento_id', orcamentoId)
    .eq('tipo', 'item')

  // Insumos dentro de composições — buscados uma única vez (todas as colunas
  // necessárias) e reaproveitados tanto para decompor recursivamente quais
  // códigos estão em uso na planilha quanto para montar o export. Filtrado
  // por compIds (não por orcamento_id do insumo) porque essa é a fonte mais
  // confiável: getInsumosByOrcamento já lida com linhas cujo orcamento_id
  // ficou inconsistente, mas o composicao_id sempre aponta certo.
  const compIds = composicoes.map((c: OrcamentoComposicao) => c.id)
  const insumosDeComposicao: { composicao_id: string; codigo: string; descricao: string; unidade: string; custo: number; indice: number; grupo: string | null }[] = []
  if (compIds.length > 0) {
    const BATCH = 100
    for (let i = 0; i < compIds.length; i += BATCH) {
      const { data } = await sb
        .from('orcamento_insumos')
        .select('composicao_id, codigo, descricao, unidade, custo, indice, grupo')
        .in('composicao_id', compIds.slice(i, i + BATCH))
      insumosDeComposicao.push(...(data ?? []))
    }
  }

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
