'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { createBase, deleteBase, preencherPrecos } from './actions'

type Base = {
  id: string
  nome: string
  orgao: string
  tipo_base: string
  total_insumos: number
  total_composicoes: number
}

type PreencherState = { baseId: string; referenciaId: string; loading: boolean; resultado: string | null }

export function BasesView({ bases: initialBases }: { bases: Base[] }) {
  const [bases, setBases] = useState(initialBases)
  const [novoNome, setNovoNome] = useState('')
  const [creating, setCreating] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [preencher, setPreencher] = useState<PreencherState | null>(null)

  const basesProprias = bases.filter(b => b.tipo_base === 'propria')
  const basesExternas = bases.filter(b => b.tipo_base !== 'propria')

  async function handlePreencher(e: React.FormEvent) {
    e.preventDefault()
    if (!preencher || !preencher.referenciaId) return
    setPreencher(prev => prev ? { ...prev, loading: true, resultado: null } : null)
    const result = await preencherPrecos(preencher.baseId, preencher.referenciaId)
    if (result.error) {
      setPreencher(prev => prev ? { ...prev, loading: false, resultado: `Erro: ${result.error}` } : null)
    } else {
      setPreencher(prev => prev ? {
        ...prev, loading: false,
        resultado: `${result.atualizados.toLocaleString('pt-BR')} preços preenchidos${result.naoEncontrados > 0 ? ` · ${result.naoEncontrados.toLocaleString('pt-BR')} não encontrados` : ''}.`
      } : null)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!novoNome.trim()) return
    setCreating(true)
    setErro(null)
    const result = await createBase(novoNome)
    if ('error' in result) {
      setErro(result.error)
    } else {
      setBases(prev => [...prev, {
        id: result.id,
        nome: novoNome.trim(),
        orgao: novoNome.trim(),
        tipo_base: 'externa',
        total_insumos: 0,
        total_composicoes: 0,
      }])
      setNovoNome('')
    }
    setCreating(false)
  }

  async function handleDelete(base: Base) {
    const totalItens = base.total_insumos + base.total_composicoes
    const msg = totalItens > 0
      ? `Excluir "${base.orgao}"? Isso removerá ${base.total_insumos.toLocaleString('pt-BR')} insumos e ${base.total_composicoes.toLocaleString('pt-BR')} composições da biblioteca global.`
      : `Excluir "${base.orgao}"?`
    if (!confirm(msg)) return
    setDeletingId(base.id)
    const result = await deleteBase(base.id)
    if (result.error) {
      alert(`Erro: ${result.error}`)
    } else {
      setBases(prev => prev.filter(b => b.id !== base.id))
    }
    setDeletingId(null)
  }

  return (
    <div className="space-y-6">
      {/* Nova base */}
      <form onSubmit={handleCreate} className="flex items-end gap-3">
        <div className="flex-1 max-w-sm">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nova base</label>
          <input
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            placeholder="Ex: SINAPI OUT 2025, SUDECAP 2024..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          />
          {erro && <p className="mt-1 text-xs text-red-600">{erro}</p>}
        </div>
        <button
          type="submit"
          disabled={creating || !novoNome.trim()}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {creating ? 'Criando...' : 'Criar base'}
        </button>
      </form>

      {/* Lista de bases */}
      {bases.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <p className="text-sm text-gray-500">Nenhuma base cadastrada.</p>
          <p className="text-xs text-gray-400 mt-1">Crie uma base acima e depois importe insumos e composições.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Base</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Insumos</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Composições</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ações</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {bases.map(base => (
                <React.Fragment key={base.id}>
                  <tr className={`hover:bg-gray-50 ${deletingId === base.id ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {base.orgao}
                      {base.tipo_base === 'propria' && (
                        <span className="ml-2 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">própria</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {base.total_insumos > 0 ? base.total_insumos.toLocaleString('pt-BR') : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                      {base.total_composicoes > 0 ? base.total_composicoes.toLocaleString('pt-BR') : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 flex items-center gap-3">
                      <Link
                        href={`/bases/${base.id}/importar` as any}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Importar →
                      </Link>
                      {base.tipo_base === 'propria' && basesExternas.length > 0 && (
                        <button
                          onClick={() => setPreencher(
                            preencher?.baseId === base.id ? null :
                            { baseId: base.id, referenciaId: basesExternas[0].id, loading: false, resultado: null }
                          )}
                          className="text-xs text-emerald-700 hover:underline"
                        >
                          Preencher preços →
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      {base.tipo_base !== 'propria' && (
                        <button
                          onClick={() => handleDelete(base)}
                          disabled={deletingId === base.id}
                          title="Excluir base"
                          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                  {preencher?.baseId === base.id && (
                    <tr className="bg-emerald-50">
                      <td colSpan={5} className="px-4 py-3">
                        <form onSubmit={handlePreencher} className="flex items-center gap-3 flex-wrap">
                          <span className="text-xs font-medium text-gray-700">Usar como referência:</span>
                          <select
                            value={preencher.referenciaId}
                            onChange={e => setPreencher(prev => prev ? { ...prev, referenciaId: e.target.value, resultado: null } : null)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                            disabled={preencher.loading}
                          >
                            {basesExternas.map(b => (
                              <option key={b.id} value={b.id}>{b.orgao}</option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            disabled={preencher.loading}
                            className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {preencher.loading ? 'Preenchendo...' : 'Preencher'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreencher(null)}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            Cancelar
                          </button>
                          {preencher.resultado && (
                            <span className="text-xs text-emerald-800 font-medium">{preencher.resultado}</span>
                          )}
                        </form>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
