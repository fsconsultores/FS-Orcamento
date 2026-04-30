'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function EditarOrcamentoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome_obra: '',
    cliente: '',
    data: '',
    bdi_global: '',
  });

  useEffect(() => {
    async function load() {
      const sb = createClient() as any;
      const { data, error } = await sb
        .from('tabela_orcamentos')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) {
        setError('Orçamento não encontrado.');
        setFetching(false);
        return;
      }
      setForm({
        nome_obra: data.nome_obra,
        cliente: data.cliente ?? '',
        data: data.data,
        bdi_global: String(data.bdi_global),
      });
      setFetching(false);
    }
    load();
  }, [id]);

  function update(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.nome_obra.trim()) { setError('Informe o nome da obra.'); return; }
    const bdi = parseFloat(form.bdi_global);
    if (isNaN(bdi) || bdi < 0) { setError('BDI inválido.'); return; }

    setLoading(true);
    try {
      const sb = createClient() as any;
      const { error: dbError } = await sb
        .from('tabela_orcamentos')
        .update({
          nome_obra: form.nome_obra.trim(),
          cliente: form.cliente.trim() || null,
          data: form.data,
          bdi_global: bdi,
        })
        .eq('id', id);
      if (dbError) throw dbError;
      router.refresh();
      router.push(`/orcamentos/${id}`);
    } catch {
      setError('Erro ao salvar. Tente novamente.');
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Excluir este orçamento e todos os seus itens? Esta ação não pode ser desfeita.')) return;
    setLoading(true);
    try {
      const sb = createClient() as any;
      const { error: dbError } = await sb.from('tabela_orcamentos').delete().eq('id', id);
      if (dbError) throw dbError;
      router.refresh();
      router.push('/orcamentos');
    } catch {
      setError('Erro ao excluir. Tente novamente.');
      setLoading(false);
    }
  }

  if (fetching) return <div className="py-20 text-center text-sm text-gray-400">Carregando...</div>;

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/orcamentos/${id}`} className="text-sm text-blue-600 hover:underline">
            ← Orçamento
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Editar orçamento</h1>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Excluir
        </button>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Nome da obra *</label>
          <input
            required
            value={form.nome_obra}
            onChange={(e) => update('nome_obra', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Cliente</label>
          <input
            value={form.cliente}
            onChange={(e) => update('cliente', e.target.value)}
            placeholder="Ex: João Silva"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Data</label>
            <input
              type="date"
              value={form.data}
              onChange={(e) => update('data', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">BDI global (%)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.bdi_global}
              onChange={(e) => update('bdi_global', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Salvar alterações'}
          </button>
          <Link href={`/orcamentos/${id}`} className="rounded-md border px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
