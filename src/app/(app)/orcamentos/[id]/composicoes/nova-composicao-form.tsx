'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { createComposicao } from '@/lib/orcamento'
import type { CreateComposicaoData } from '@/lib/orcamento'

const EMPTY: CreateComposicaoData = {
  codigo: '',
  descricao: '',
  unidade: '',
  base: null,
}

export function NovaComposicaoForm({ orcamentoId }: { orcamentoId: string }) {
  const router = useRouter()
  const [form, setForm] = useState<CreateComposicaoData>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof CreateComposicaoData, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      await createComposicao(supabase as any, orcamentoId, form)
      setForm(EMPTY)
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
      <h2 className="font-semibold text-gray-800">Nova Composição</h2>

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
          <label className="block text-xs font-medium text-gray-600 mb-1">Base</label>
          <input
            value={form.base ?? ''}
            onChange={(e) => set('base', e.target.value || null)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
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
          {loading ? 'Salvando...' : 'Salvar Composição'}
        </button>
      </div>
    </form>
  )
}
