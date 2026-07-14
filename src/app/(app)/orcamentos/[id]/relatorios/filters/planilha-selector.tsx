'use client'

export type EscopoPlanilha = 'todas' | 'atual' | 'selecionar'

export interface PlanilhaResumo {
  id: string
  nome: string
}

interface Props {
  planilhas: PlanilhaResumo[]
  planilhaAtualId: string | null
  escopo: EscopoPlanilha
  selecionadas: string[]
  onChange: (escopo: EscopoPlanilha, selecionadas: string[]) => void
  pending?: boolean
}

export function PlanilhaSelector({ planilhas, planilhaAtualId, escopo, selecionadas, onChange, pending }: Props) {
  if (planilhas.length <= 1) return null

  const atualNome = planilhas.find(p => p.id === planilhaAtualId)?.nome

  function toggleSelecionada(id: string) {
    const next = selecionadas.includes(id) ? selecionadas.filter(x => x !== id) : [...selecionadas, id]
    onChange('selecionar', next)
  }

  return (
    <div className={`rounded-lg border border-gray-200 p-3 ${pending ? 'opacity-60' : ''}`}>
      <p className="text-xs font-semibold text-gray-700 mb-2">Planilhas incluídas</p>
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="radio" name="escopo-planilha" className="accent-blue-600" checked={escopo === 'todas'}
            onChange={() => onChange('todas', [])} />
          Todas as planilhas ({planilhas.length})
        </label>
        <label className={`flex items-center gap-2 text-sm text-gray-700 ${planilhaAtualId ? 'cursor-pointer' : 'cursor-not-allowed text-gray-400'}`}>
          <input type="radio" name="escopo-planilha" className="accent-blue-600" checked={escopo === 'atual'}
            disabled={!planilhaAtualId}
            onChange={() => planilhaAtualId && onChange('atual', [planilhaAtualId])} />
          Apenas a planilha atual{atualNome ? ` (${atualNome})` : ''}
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input type="radio" name="escopo-planilha" className="accent-blue-600" checked={escopo === 'selecionar'}
            onChange={() => onChange('selecionar', selecionadas.length > 0 ? selecionadas : planilhaAtualId ? [planilhaAtualId] : [])} />
          Selecionar planilhas
        </label>
      </div>

      {escopo === 'selecionar' && (
        <div className="mt-2 ml-6 space-y-1 max-h-36 overflow-y-auto border-l border-gray-100 pl-3">
          {planilhas.map(p => (
            <label key={p.id} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" className="accent-blue-600" checked={selecionadas.includes(p.id)}
                onChange={() => toggleSelecionada(p.id)} />
              {p.nome}
            </label>
          ))}
          {selecionadas.length === 0 && <p className="text-xs text-amber-600">Selecione ao menos uma planilha.</p>}
        </div>
      )}
    </div>
  )
}
