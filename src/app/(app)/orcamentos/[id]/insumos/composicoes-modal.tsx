'use client'

import Link from 'next/link'
import type { OrcamentoInsumo } from '@/lib/orcamento'

export interface ComposicoesModalState {
  insumo: OrcamentoInsumo
  loading: boolean
  composicoes: { id: string; codigo: string; descricao: string; unidade: string }[]
}

export function ComposicoesModal({
  modal,
  orcamentoId,
  onClose,
}: {
  modal: ComposicoesModalState
  orcamentoId: string
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}>
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Composições que utilizam este insumo</h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">
              {modal.insumo.codigo} — {modal.insumo.descricao}
            </p>
          </div>
          <button onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {modal.loading ? (
          <p className="py-8 text-center text-sm text-gray-400">Carregando…</p>
        ) : modal.composicoes.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Nenhuma composição utiliza este insumo neste orçamento.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden max-h-80 overflow-y-auto">
            {modal.composicoes.map(c => (
              <li key={c.id}>
                <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`}
                  onClick={onClose}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors">
                  <span className="font-mono text-xs text-gray-500 w-24 shrink-0">{c.codigo}</span>
                  <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">{c.descricao}</span>
                  <span className="text-xs text-gray-400 shrink-0">{c.unidade}</span>
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
