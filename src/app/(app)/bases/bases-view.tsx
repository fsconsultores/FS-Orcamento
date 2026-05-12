'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { createBase, deleteBase } from './actions'

type Base = {
  id: string
  nome: string
  orgao: string
  tipo_base: string
  total_insumos: number
  total_composicoes: number
}

export function BasesView({ bases: initialBases }: { bases: Base[] }) {
  const [bases, setBases] = useState(initialBases)
  const [novoNome, setNovoNome] = useState('')
  const [creating, setCreating] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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
                <th className="px-4 py-3 text-left font-medium text-gray-600">Importar dados</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {bases.map(base => (
                <tr key={base.id} className={`hover:bg-gray-50 ${deletingId === base.id ? 'opacity-40' : ''}`}>
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
                  <td className="px-4 py-3">
                    <Link
                      href={`/bases/${base.id}/importar` as any}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Importar →
                    </Link>
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
