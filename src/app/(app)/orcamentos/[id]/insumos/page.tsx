import { createClient } from '@/lib/supabase/server'
import { getAvulsosBasico, getComposicoesBasico } from '@/lib/orcamento'
import { OrcamentoInsumosTable } from './insumos-table'
import { DevProfiler } from '@/components/dev-profiler'

export default async function OrcamentoInsumosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const sb = supabase as any

  // Busca rápida: só avulsos (custo/fornecedor próprios, não dependem de
  // mais nada) + composições sem custo_unitario (não usado nesta página —
  // só a contagem e a base de cada uma importam aqui). Insumos embutidos em
  // composições sem avulso equivalente, o filtro "usados/não utilizados" e
  // as sugestões de preço cross-obra (busca 1 lote de até 200 códigos POR
  // CADA 200 avulsos sem preço — chegou a 21 requisições em paralelo num
  // orçamento real) dependem do vínculo composição→insumos ou de uma busca
  // cross-orçamento cara e são carregados à parte, em background — ver
  // getInsumosDetalhadoAction.
  const [avulsos, composicoes] = await Promise.all([
    getAvulsosBasico(sb, orcamentoId),
    getComposicoesBasico(sb, orcamentoId),
  ])

  // Bases utilizadas: conta avulsos por base + composições por base
  const basesMap = new Map<string, { insumos: number; composicoes: number }>()
  for (const ins of avulsos) {
    const key = ins.base?.trim() || '—'
    const e = basesMap.get(key) ?? { insumos: 0, composicoes: 0 }
    e.insumos++
    basesMap.set(key, e)
  }
  for (const comp of composicoes) {
    const key = comp.base?.trim() || '—'
    const e = basesMap.get(key) ?? { insumos: 0, composicoes: 0 }
    e.composicoes++
    basesMap.set(key, e)
  }
  const bases = Array.from(basesMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insumos do Orçamento</h1>
          <p className="text-sm text-gray-500 mt-1">{avulsos.length} avulsos · {composicoes.length} serviço(s)</p>
        </div>
        {bases.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Bases:</span>
            {bases.map(([nome, counts]) => (
              <span
                key={nome}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700 shadow-sm"
                title={`${counts.insumos} insumo(s) avulso(s) · ${counts.composicoes} serviço(s)`}
              >
                {nome}
                <span className="text-gray-400">
                  {counts.insumos > 0 && counts.composicoes > 0
                    ? `${counts.insumos}i · ${counts.composicoes}s`
                    : counts.insumos > 0
                    ? `${counts.insumos} ins.`
                    : `${counts.composicoes} serv.`}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      <DevProfiler id="OrcamentoInsumosTable">
        <OrcamentoInsumosTable initialInsumos={avulsos} orcamentoId={orcamentoId} />
      </DevProfiler>
    </div>
  )
}
