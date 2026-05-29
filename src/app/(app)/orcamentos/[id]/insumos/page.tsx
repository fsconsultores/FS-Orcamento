import { createClient } from '@/lib/supabase/server'
import { getInsumosByOrcamento, getComposicoesByOrcamento } from '@/lib/orcamento'
import { NovoInsumoForm } from './novo-insumo-form'
import { OrcamentoInsumosTable } from './insumos-table'

export default async function OrcamentoInsumosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const [insumos, composicoes] = await Promise.all([
    getInsumosByOrcamento(supabase as any, orcamentoId),
    getComposicoesByOrcamento(supabase as any, orcamentoId),
  ])

  // Bases utilizadas: conta avulsos por base + composições por base
  const basesMap = new Map<string, { insumos: number; composicoes: number }>()
  for (const ins of insumos) {
    if (ins.composicao_id !== null) continue  // só avulsos
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
          <p className="text-sm text-gray-500 mt-1">{insumos.filter(i => i.composicao_id === null).length} avulsos · {composicoes.length} serviço(s)</p>
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

      <NovoInsumoForm orcamentoId={orcamentoId} composicoes={composicoes} />

      <OrcamentoInsumosTable initialInsumos={insumos} orcamentoId={orcamentoId} />
    </div>
  )
}
