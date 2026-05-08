'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createInsumo } from '@/lib/orcamento'
import type { CreateInsumoData, OrcamentoComposicao } from '@/lib/orcamento'

interface Props {
  orcamentoId: string
  composicoes: Pick<OrcamentoComposicao, 'id' | 'codigo' | 'descricao'>[]
}

const makeEmpty = (): CreateInsumoData => ({
  composicao_id: null,
  codigo: '',
  descricao: '',
  unidade: '',
  custo: 0,
  indice: 1,
  grupo: null,
  base: null,
  data_ref: null,
})

export function NovoInsumoForm({ orcamentoId, composicoes }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<CreateInsumoData>(makeEmpty)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof CreateInsumoData, value: string | number | null) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      await createInsumo(supabase as any, orcamentoId, form)
      setForm(makeEmpty())
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Novo Insumo
      </button>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-800">Novo Insumo</h2>
        <button
          type="button"
          onClick={() => { setOpen(false); setForm(makeEmpty()); setError(null) }}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Código *</label>
          <input
            required
            autoFocus
            value={form.codigo}
            onChange={(e) => set('codigo', e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Descrição *</label>
          <input
            required
            value={form.descricao}
            onChange={(e) => set('descricao', e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Unidade *</label>
          <input
            required
            value={form.unidade}
            onChange={(e) => set('unidade', e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Custo *</label>
          <input
            required
            type="number"
            step="0.0001"
            min="0"
            value={form.custo}
            onChange={(e) => set('custo', parseFloat(e.target.value) || 0)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Grupo</label>
          <input
            value={form.grupo ?? ''}
            onChange={(e) => set('grupo', e.target.value || null)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Base</label>
          <input
            value={form.base ?? ''}
            onChange={(e) => set('base', e.target.value || null)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Data Ref.</label>
          <input
            value={form.data_ref ?? ''}
            onChange={(e) => set('data_ref', e.target.value || null)}
            placeholder="MM/AAAA"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {composicoes.length > 0 && (
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Composição pai</label>
            <select
              value={form.composicao_id ?? ''}
              onChange={(e) => set('composicao_id', e.target.value || null)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Nenhuma (insumo avulso) —</option>
              {composicoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.descricao}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { setOpen(false); setForm(makeEmpty()); setError(null) }}
          className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Salvando...' : 'Salvar Insumo'}
        </button>
      </div>
    </form>
  )
}
