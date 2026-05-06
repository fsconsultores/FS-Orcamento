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
  grupo: null,
  base: null,
  data_ref: null,
})

export function NovoInsumoForm({ orcamentoId, composicoes }: Props) {
  const router = useRouter()
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
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-gray-200 bg-white p-4 space-y-4"
    >
      <h2 className="font-semibold text-gray-800">Novo Insumo</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Código *</label>
          <input
            required
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

      <div className="flex justify-end">
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
