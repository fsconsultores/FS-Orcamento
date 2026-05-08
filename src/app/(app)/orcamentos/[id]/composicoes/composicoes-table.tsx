'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { OrcamentoComposicao } from '@/lib/orcamento'

export function ComposicoesTable({
  composicoes,
  orcamentoId,
}: {
  composicoes: OrcamentoComposicao[]
  orcamentoId: string
}) {
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const visible = q
    ? composicoes.filter(
        (c) =>
          c.codigo.toLowerCase().includes(q) ||
          c.descricao.toLowerCase().includes(q)
      )
    : composicoes

  return (
    <div className="space-y-3">
      <div className="relative">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
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
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  {q
                    ? 'Nenhuma composição encontrada para essa busca.'
                    : 'Nenhuma composição cadastrada neste orçamento.'}
                </td>
              </tr>
            ) : (
              visible.map((c) => (
                <tr
                  key={c.id}
                  className="cursor-pointer hover:bg-blue-50 hover:shadow-[inset_3px_0_0_0_#3b82f6] transition-all"
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full">
                      {c.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full">
                      {c.descricao}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full">
                      {c.unidade}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full">
                      {c.custo_unitario > 0
                        ? c.custo_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : <span className="text-gray-300">—</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full">
                      {c.base ?? '—'}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
