'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { logAction } from '@/lib/log';

export default function NovoOrcamentoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome_obra: '',
    cliente: '',
    data: new Date().toISOString().split('T')[0],
    bdi_global: '25',
    codigo: '0',
  });

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.nome_obra.trim()) {
      setError('Informe o nome da obra.');
      return;
    }
    const bdi = parseFloat(form.bdi_global);
    if (isNaN(bdi) || bdi < 0) {
      setError('BDI inválido.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data, error: dbError } = await supabase
        .from('tabela_orcamentos')
        .insert({
          user_id: user.id,
          nome_obra: form.nome_obra.trim(),
          cliente: form.cliente.trim() || null,
          data: form.data,
          bdi_global: bdi,
          codigo: form.codigo,
        })
        .select('id')
        .single();

      if (dbError) throw dbError;

      await logAction(supabase, {
        usuario: user.email ?? '',
        tipo: 'sucesso',
        acao: 'criar_orcamento',
        mensagem: `Orçamento "${form.nome_obra.trim()}" criado com sucesso`,
      });

      router.push(`/orcamentos/${data.id}`);
    } catch {
      setError('Erro ao salvar. Tente novamente.');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link href="/orcamentos" className="text-sm text-blue-600 hover:underline">
          ← Orçamentos
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Novo orçamento</h1>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <label htmlFor="nome_obra" className="text-sm font-medium text-gray-700">
            Nome da obra *
          </label>
          <input
            id="nome_obra"
            required
            value={form.nome_obra}
            onChange={(e) => update('nome_obra', e.target.value)}
            placeholder="Ex: Residência Unifamiliar - Rua das Flores"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
      
          <label htmlFor="codigo" className="text-sm font-medium text-gray-700">
            Código *
          </label>
          <input
            id="codigo"
            required
            value={form.codigo}
            onChange={(e) => update('codigo', e.target.value)}
            placeholder="Código"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        

        <div className="space-y-1">
          <label htmlFor="cliente" className="text-sm font-medium text-gray-700">
            Cliente
          </label>
          <input
            id="cliente"
            value={form.cliente}
            onChange={(e) => update('cliente', e.target.value)}
            placeholder="Ex: João Silva"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="data" className="text-sm font-medium text-gray-700">
              Data
            </label>
            <input
              id="data"
              type="date"
              value={form.data}
              onChange={(e) => update('data', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="bdi_global" className="text-sm font-medium text-gray-700">
              BDI global (%)
            </label>
            <input
              id="bdi_global"
              type="number"
              min="0"
              step="0.01"
              value={form.bdi_global}
              onChange={(e) => update('bdi_global', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Criar orçamento'}
          </button>
          <Link
            href="/orcamentos"
            className="rounded-md border px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
