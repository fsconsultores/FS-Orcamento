'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { OrcamentoInsumo } from '@/lib/orcamento'

export function OrcamentoInsumosTable({
  initialInsumos,
  orcamentoId,
}: {
  initialInsumos: OrcamentoInsumo[]
  orcamentoId: string
}) {
  const [insumos, setInsumos] = useState(initialInsumos)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const visible = q
    ? insumos.filter(ins =>
        ins.codigo.toLowerCase().includes(q) ||
        ins.descricao.toLowerCase().includes(q)
      )
    : insumos

  function startEdit(ins: OrcamentoInsumo, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setEditingId(ins.id)
    setEditingValue(String(ins.custo))
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingValue('')
  }

  async function saveEdit(id: string) {
    if (savingId) return
    const parsed = parseFloat(editingValue.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0) { cancelEdit(); return }

    const alvo = insumos.find(ins => ins.id === id)
    if (!alvo) { cancelEdit(); return }

    setSavingId(id)
    setEditingId(null)
    const sb = createClient() as any

    // Atualiza TODOS os registros com o mesmo código neste orçamento
    // para que o cálculo de custo das composições seja correto
    const { error } = await sb
      .from('orcamento_insumos')
      .update({ custo: parsed })
      .eq('codigo', alvo.codigo)
      .eq('orcamento_id', orcamentoId)

    if (!error) {
      setInsumos(prev => prev.map(ins => ins.id === id ? { ...ins, custo: parsed } : ins))
    }
    setSavingId(null)
  }

  async function handleExport() {
    const XLSX = await import('xlsx')
    const rows = insumos.map(ins => ({
      'Código': ins.codigo,
      'Descrição': ins.descricao,
      'Unidade': ins.unidade,
      'Custo': ins.custo,
      'Grupo': ins.grupo ?? '',
      'Base': ins.base ?? '',
      'Data Ref.': ins.data_ref ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Insumos')
    const today = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `insumos_${today}.xlsx`)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="search"
            placeholder="Buscar por código ou descrição..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <button
          onClick={handleExport}
          disabled={insumos.length === 0}
          className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exportar XLSX
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3 text-right">Custo</th>
              <th className="px-4 py-3">Grupo</th>
              <th className="px-4 py-3">Base</th>
              <th className="px-4 py-3">Data Ref.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  {q ? 'Nenhum insumo encontrado para essa busca.' : 'Nenhum insumo cadastrado neste orçamento.'}
                </td>
              </tr>
            ) : (
              visible.map((insumo) => (
                <tr key={insumo.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{insumo.codigo}</td>
                  <td className="px-4 py-3">{insumo.descricao}</td>
                  <td className="px-4 py-3 text-gray-500">{insumo.unidade}</td>
                  <td className="px-4 py-3 text-right w-36">
                    {editingId === insumo.id ? (
                      <input
                        autoFocus
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onBlur={() => saveEdit(insumo.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); saveEdit(insumo.id) }
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        className="w-full text-right border border-blue-400 rounded px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500/40 bg-white"
                      />
                    ) : (
                      <button
                        onClick={(e) => startEdit(insumo, e)}
                        title="Clique para editar o custo"
                        className={`block w-full text-right tabular-nums ${
                          savingId === insumo.id
                            ? 'text-gray-400 cursor-wait'
                            : 'text-gray-900 hover:text-blue-600 hover:underline cursor-text'
                        }`}
                      >
                        {savingId === insumo.id
                          ? '…'
                          : insumo.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{insumo.grupo ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{insumo.base ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{insumo.data_ref ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
