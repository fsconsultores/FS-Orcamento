'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Composicao = { id: string; codigo: string; descricao: string; unidade: string };

export function AdicionarItemForm({
  orcamentoId,
  bdiGlobal,
  composicoes,
}: {
  orcamentoId: string;
  bdiGlobal: number;
  composicoes: Composicao[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    composicao_id: '',
    quantidade: '',
    bdi_especifico: '',
  });

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.composicao_id) { setError('Selecione uma composição.'); return; }
    const qtd = parseFloat(form.quantidade);
    if (isNaN(qtd) || qtd <= 0) { setError('Quantidade inválida.'); return; }
    const bdiEsp = form.bdi_especifico !== '' ? parseFloat(form.bdi_especifico) : null;
    if (bdiEsp !== null && (isNaN(bdiEsp) || bdiEsp < 0)) { setError('BDI específico inválido.'); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: dbError } = await supabase.from('tabela_itens_orcamento').insert({
        orcamento_id: orcamentoId,
        composicao_id: form.composicao_id,
        quantidade: qtd,
        bdi_especifico: bdiEsp,
      });
      if (dbError) throw dbError;
      setForm({ composicao_id: '', quantidade: '', bdi_especifico: '' });
      router.refresh();
    } catch {
      setError('Erro ao adicionar item.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold text-gray-900">Adicionar item</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px] space-y-1">
          <label className="text-xs font-medium text-gray-600">Composição *</label>
          <select
            value={form.composicao_id}
            onChange={(e) => update('composicao_id', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">Selecione...</option>
            {composicoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.descricao} ({c.unidade})
              </option>
            ))}
          </select>
        </div>

        <div className="w-28 space-y-1">
          <label className="text-xs font-medium text-gray-600">Quantidade *</label>
          <input
            type="number"
            min="0.0001"
            step="any"
            placeholder="0,00"
            value={form.quantidade}
            onChange={(e) => update('quantidade', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="w-32 space-y-1">
          <label className="text-xs font-medium text-gray-600">
            BDI espec. (%) <span className="text-gray-400">padrão: {bdiGlobal}%</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder={`${bdiGlobal}`}
            value={form.bdi_especifico}
            onChange={(e) => update('bdi_especifico', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Adicionando...' : 'Adicionar'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
