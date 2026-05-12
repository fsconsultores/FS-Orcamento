'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { OrcamentoComposicao } from '@/lib/orcamento'
import { ClientPagination } from '@/components/client-pagination'

const PAGE_SIZE = 100

export function ComposicoesTable({
  composicoes: initialComposicoes,
  orcamentoId,
}: {
  composicoes: OrcamentoComposicao[]
  orcamentoId: string
}) {
  const [composicoes, setComposicoes] = useState(initialComposicoes)
  const [query, setQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const visible = q
    ? composicoes.filter(
        (c) =>
          c.codigo.toLowerCase().includes(q) ||
          c.descricao.toLowerCase().includes(q)
      )
    : composicoes

  useEffect(() => { setCurrentPage(1) }, [q])

  const paged = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Excluir esta composição? Os insumos vinculados não serão excluídos.')) return
    setDeletingId(id)
    setComposicoes(prev => prev.filter(c => c.id !== id))
    const sb = createClient() as any
    const { error } = await sb.from('orcamento_composicoes').delete().eq('id', id)
    if (error) {
      setComposicoes(initialComposicoes)
      alert(`Erro ao excluir: ${error.message}`)
    }
    setDeletingId(null)
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="search"
          placeholder="Buscar por código ou descrição..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-16rem)] rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3 text-right">
                Custo Unitário
                <span className="ml-1 font-normal normal-case text-gray-400">(calculado)</span>
              </th>
              <th className="px-4 py-3">Base</th>
              <th className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  {q ? 'Nenhuma composição encontrada.' : 'Nenhuma composição cadastrada neste orçamento.'}
                </td>
              </tr>
            ) : (
              paged.map((c) => (
                <tr key={c.id}
                  className={`group cursor-pointer hover:bg-blue-50 hover:shadow-[inset_3px_0_0_0_#3b82f6] transition-all ${deletingId === c.id ? 'opacity-40' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full">{c.codigo}</Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full">{c.descricao}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full">{c.unidade}</Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full">
                      {c.custo_unitario > 0
                        ? c.custo_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : <span className="text-gray-300">—</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full">{c.base ?? '—'}</Link>
                  </td>
                  <td className="px-2 py-3">
                    <button
                      onClick={(e) => handleDelete(e, c.id)}
                      title="Excluir composição"
                      className="opacity-0 group-hover:opacity-100 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ClientPagination
        total={visible.length}
        page={currentPage}
        pageSize={PAGE_SIZE}
        onPageChange={setCurrentPage}
      />
    </div>
  )
}
