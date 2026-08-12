'use client'

import { useState } from 'react'
import { adicionarItemEstrutura, type EstruturaItem } from './planilha-crud-action'
import { CodigoAutocomplete } from './codigo-autocomplete'

export function AddItemForm({
  orcamentoId, parentId, parentNivel, parentNumero, parentDescricao, onClose, isGroup, planilhaId,
}: {
  orcamentoId: string
  parentId: string | null
  parentNivel: number
  parentNumero: string
  parentDescricao?: string
  onClose: (newItem?: EstruturaItem) => void
  isGroup?: boolean
  planilhaId?: string | null
}) {
  const [form, setForm] = useState({ codigo: '', descricao: '', unidade: '', quantidade: '', custo_unitario: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const newItem = await adicionarItemEstrutura(orcamentoId, parentId, parentNivel, {
        numero: '',
        codigo: isGroup ? null : (form.codigo || null),
        descricao: form.descricao,
        unidade: isGroup ? null : (form.unidade || null),
        quantidade: isGroup ? null : (parseFloat(form.quantidade.replace(',', '.')) || null),
        custo_unitario: isGroup ? null : (parseFloat(form.custo_unitario.replace(',', '.')) || null),
        tipo: isGroup ? 'grupo' : 'item',
      }, planilhaId)
      onClose(newItem)
    } finally { setLoading(false) }
  }

  const inp = 'w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400'
  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-lg text-xs overflow-hidden">
      {parentDescricao && (
        <div className="px-3 py-1.5 bg-blue-600 text-white text-[11px] font-medium flex items-center gap-2">
          <span className="opacity-70">Adicionando em:</span>
          <span className="font-mono">{parentNumero}</span>
          <span className="truncate">{parentDescricao}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-end p-2">
        {!isGroup && (
          <div className="relative">
            <label className="block text-gray-500 mb-0.5">Código</label>
            <CodigoAutocomplete
              value={form.codigo} orcamentoId={orcamentoId} className={`${inp} w-24`}
              onChange={v => setForm(p => ({ ...p, codigo: v }))}
              onSelect={s => setForm(p => ({ ...p, codigo: s.codigo, descricao: s.descricao, unidade: s.unidade, custo_unitario: s.custo_unitario != null ? String(s.custo_unitario) : p.custo_unitario }))}
            />
          </div>
        )}
        <div className="flex-1 min-w-48">
          <label className="block text-gray-500 mb-0.5">Descrição *</label>
          <input autoFocus required value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} className={inp} />
        </div>
        {!isGroup && (
          <>
            <div>
              <label className="block text-gray-500 mb-0.5">Und</label>
              <input value={form.unidade} onChange={e => setForm(p => ({ ...p, unidade: e.target.value }))} className={`${inp} w-16`} />
            </div>
            <div>
              <label className="block text-gray-500 mb-0.5">Qtde</label>
              <input type="number" step="any" value={form.quantidade} onChange={e => setForm(p => ({ ...p, quantidade: e.target.value }))} className={`${inp} w-20`} />
            </div>
            <div>
              <label className="block text-gray-500 mb-0.5">R$ Unit.</label>
              <input type="number" step="any" value={form.custo_unitario} onChange={e => setForm(p => ({ ...p, custo_unitario: e.target.value }))} className={`${inp} w-28`} />
            </div>
          </>
        )}
        <div className="flex gap-1">
          <button type="submit" disabled={loading} className="rounded bg-blue-600 px-3 py-1 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? '...' : 'Salvar'}
          </button>
          <button type="button" onClick={() => onClose()} className="rounded border px-3 py-1 text-gray-600 hover:bg-gray-100">✕</button>
        </div>
      </div>
    </form>
  )
}
