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
    local: '',
    data: '',
    bdi_global: '',
    area_total: '',
    area_coberta: '',
    area_equivalente: '',
  });
  const [servicosEstimados, setServicosEstimados] = useState<{ id?: string; descricao: string; valor: string }[]>([]);

  useEffect(() => {
    async function load() {
      const sb = createClient() as any;
      const [{ data, error }, { data: servicos }] = await Promise.all([
        sb.from('tabela_orcamentos').select('*').eq('id', id).single(),
        sb.from('orcamento_servicos_estimados').select('id, descricao, valor').eq('orcamento_id', id).order('ordem', { ascending: true }),
      ]);
      if (error || !data) {
        setError('Orçamento não encontrado.');
        setFetching(false);
        return;
      }
      setForm({
        nome_obra: data.nome_obra,
        cliente: data.cliente ?? '',
        local: data.local ?? '',
        data: data.data,
        bdi_global: String(data.bdi_global),
        area_total: data.area_total != null ? String(data.area_total) : '',
        area_coberta: data.area_coberta != null ? String(data.area_coberta) : '',
        area_equivalente: data.area_equivalente != null ? String(data.area_equivalente) : '',
      });
      setServicosEstimados(
        (servicos ?? []).map((s: any) => ({ id: s.id, descricao: s.descricao, valor: String(s.valor) }))
      );
      setFetching(false);
    }
    load();
  }, [id]);

  function update(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function updateServico(index: number, field: 'descricao' | 'valor', value: string) {
    setServicosEstimados(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  }

  function addServico() {
    setServicosEstimados(prev => [...prev, { descricao: '', valor: '' }]);
  }

  function removeServico(index: number) {
    setServicosEstimados(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.nome_obra.trim()) { setError('Informe o nome da obra.'); return; }
    const bdi = parseFloat(form.bdi_global);
    if (isNaN(bdi) || bdi < 0) { setError('BDI inválido.'); return; }

    const servicosValidos = servicosEstimados
      .map(s => ({ descricao: s.descricao.trim(), valor: parseFloat(s.valor) || 0 }))
      .filter(s => s.descricao);

    setLoading(true);
    try {
      const sb = createClient() as any;
      const { error: dbError } = await sb
        .from('tabela_orcamentos')
        .update({
          nome_obra: form.nome_obra.trim(),
          cliente: form.cliente.trim() || null,
          local: form.local.trim() || null,
          data: form.data,
          bdi_global: bdi,
          area_total: form.area_total ? parseFloat(form.area_total) : null,
          area_coberta: form.area_coberta ? parseFloat(form.area_coberta) : null,
          area_equivalente: form.area_equivalente ? parseFloat(form.area_equivalente) : null,
        })
        .eq('id', id);
      if (dbError) throw dbError;

      const { error: delError } = await sb.from('orcamento_servicos_estimados').delete().eq('orcamento_id', id);
      if (delError) throw delError;

      if (servicosValidos.length > 0) {
        const { error: insError } = await sb.from('orcamento_servicos_estimados').insert(
          servicosValidos.map((s, i) => ({ orcamento_id: id, descricao: s.descricao, valor: s.valor, ordem: i }))
        );
        if (insError) throw insError;
      }

      router.refresh();
      router.push(`/orcamentos/${id}/planilha`);
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
          <Link href={`/orcamentos/${id}/planilha`} className="text-sm text-blue-600 hover:underline">
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

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Local</label>
          <input
            value={form.local}
            onChange={(e) => update('local', e.target.value)}
            placeholder="Ex: Conceição do Pará - MG"
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

        <div className="border-t pt-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Resumo Geral do Orçamento</h2>
            <p className="text-xs text-gray-500 mt-0.5">Usado no Caderno de Orçamento (seção 3.0).</p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Área total (m²)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.area_total}
                onChange={(e) => update('area_total', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Áreas cobertas (m²)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.area_coberta}
                onChange={(e) => update('area_coberta', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Área equivalente (m²)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.area_equivalente}
                onChange={(e) => update('area_equivalente', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Serviços estimados (B)</label>
              <button
                type="button"
                onClick={addServico}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                + Adicionar
              </button>
            </div>
            {servicosEstimados.length === 0 && (
              <p className="text-xs text-gray-400">Nenhum serviço estimado cadastrado.</p>
            )}
            {servicosEstimados.map((s, i) => (
              <div key={s.id ?? `new-${i}`} className="flex gap-2">
                <input
                  value={s.descricao}
                  onChange={(e) => updateServico(i, 'descricao', e.target.value)}
                  placeholder="Descrição"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={s.valor}
                  onChange={(e) => updateServico(i, 'valor', e.target.value)}
                  placeholder="Valor (R$)"
                  className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => removeServico(i)}
                  className="rounded-md border border-gray-300 px-2.5 text-sm text-gray-500 hover:bg-gray-50"
                >
                  ×
                </button>
              </div>
            ))}
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
          <Link href={`/orcamentos/${id}/planilha`} className="rounded-md border px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
