'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/costs';
import { baseLabelFromOrgao } from '@/components/base-labels';

type InsumoRow = { id: string; codigo: string; descricao: string; unidade: string; preco_base: number };
type ItemForm = { insumo_id: string; indice: string };

export default function EditarComposicaoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insumos, setInsumos] = useState<InsumoRow[]>([]);
  const [baseInfo, setBaseInfo] = useState<{ orgao: string; tipo_base: string } | null>(null);
  const [form, setForm] = useState({ codigo: '', descricao: '', unidade: '' });
  const [itens, setItens] = useState<ItemForm[]>([{ insumo_id: '', indice: '' }]);

  useEffect(() => {
    async function load() {
      const sb = createClient() as any;
      const [compRes, insRes] = await Promise.all([
        sb
          .from('tabela_composicoes')
          .select(`*, tabela_bases(orgao, tipo_base), tabela_itens_composicao(insumo_id, indice)`)
          .eq('id', id)
          .single(),
        sb.from('tabela_insumos').select('id, codigo, descricao, unidade, preco_base').order('codigo'),
      ]);
      if (compRes.error || !compRes.data) {
        setError('Composição não encontrada.');
        setFetching(false);
        return;
      }
      const comp = compRes.data;
      setForm({ codigo: comp.codigo, descricao: comp.descricao, unidade: comp.unidade });
      setBaseInfo(comp.tabela_bases ?? null);
      const existingItens = (comp.tabela_itens_composicao ?? []) as { insumo_id: string; indice: number }[];
      setItens(
        existingItens.length > 0
          ? existingItens.map(i => ({ insumo_id: i.insumo_id, indice: String(i.indice) }))
          : [{ insumo_id: '', indice: '' }]
      );
      setInsumos(insRes.data ?? []);
      setFetching(false);
    }
    load();
  }, [id]);

  function updateForm(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function updateItem(index: number, field: keyof ItemForm, value: string) {
    setItens(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  function addItem() {
    setItens(prev => [...prev, { insumo_id: '', indice: '' }]);
  }

  function removeItem(index: number) {
    setItens(prev => prev.filter((_, i) => i !== index));
  }

  const custoPreview = itens.reduce((sum, item) => {
    const ins = insumos.find(i => i.id === item.insumo_id);
    const idx = parseFloat(item.indice);
    if (!ins || isNaN(idx) || idx <= 0) return sum;
    return sum + ins.preco_base * idx;
  }, 0);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!form.codigo.trim() || !form.descricao.trim() || !form.unidade.trim()) {
      setError('Preencha código, descrição e unidade.');
      return;
    }
    const itensValidos = itens.filter(i => i.insumo_id && i.indice);
    if (itensValidos.length === 0) { setError('Adicione ao menos um insumo.'); return; }
    for (const item of itensValidos) {
      const v = parseFloat(item.indice);
      if (isNaN(v) || v <= 0) { setError('Índice deve ser maior que zero.'); return; }
    }

    setLoading(true);
    try {
      const sb = createClient() as any;

      const { error: updErr } = await sb
        .from('tabela_composicoes')
        .update({ codigo: form.codigo.trim(), descricao: form.descricao.trim(), unidade: form.unidade.trim() })
        .eq('id', id);
      if (updErr) throw updErr;

      const { error: delErr } = await sb
        .from('tabela_itens_composicao')
        .delete()
        .eq('composicao_id', id);
      if (delErr) throw delErr;

      const { error: insErr } = await sb.from('tabela_itens_composicao').insert(
        itensValidos.map((item: { insumo_id: string; indice: string }) => ({
          composicao_id: id,
          insumo_id: item.insumo_id,
          indice: parseFloat(item.indice),
        }))
      );
      if (insErr) throw insErr;

      router.refresh();
      router.push(`/composicoes/${id}`);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '';
      setError(msg.includes('uq_composicao_codigo')
        ? 'Já existe uma composição com esse código.'
        : 'Erro ao salvar. Tente novamente.');
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Excluir esta composição? Esta ação não pode ser desfeita.')) return;
    setLoading(true);
    try {
      const sb = createClient() as any;
      const { error: dbError } = await sb.from('tabela_composicoes').delete().eq('id', id);
      if (dbError) throw dbError;
      router.refresh();
      router.push('/composicoes');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '';
      setError(msg.includes('itens_orcamento')
        ? 'Composição em uso por orçamentos — não é possível excluir.'
        : 'Erro ao excluir. Tente novamente.');
      setLoading(false);
    }
  }

  if (fetching) return <div className="py-20 text-center text-sm text-gray-400">Carregando...</div>;

  const isExterna = baseInfo?.tipo_base === 'externa';
  const inputClass = (disabled: boolean) =>
    `w-full rounded-md border px-3 py-2 text-sm outline-none ${
      disabled
        ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
        : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
    }`;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href={`/composicoes/${id}`} className="text-sm text-blue-600 hover:underline">
            ← Composição
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            {isExterna ? 'Visualizar composição' : 'Editar composição'}
          </h1>
          {baseInfo && (
            <p className="mt-1 text-xs text-gray-500">
              Base: <span className="font-medium">{baseLabelFromOrgao(baseInfo.orgao)}</span>
              {isExterna && ' · somente leitura'}
            </p>
          )}
        </div>
        {!isExterna && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            Excluir
          </button>
        )}
      </div>

      {isExterna && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Esta composição pertence à base externa <strong>{baseInfo?.orgao}</strong> e não pode ser editada.
        </div>
      )}

      <form onSubmit={isExterna ? (e) => e.preventDefault() : handleSubmit} className="space-y-5">
        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-900">Dados gerais</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Código</label>
              <input
                required={!isExterna}
                value={form.codigo}
                onChange={(e) => updateForm('codigo', e.target.value)}
                disabled={isExterna}
                className={inputClass(isExterna)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Unidade</label>
              <input
                required={!isExterna}
                value={form.unidade}
                onChange={(e) => updateForm('unidade', e.target.value)}
                disabled={isExterna}
                className={inputClass(isExterna)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Descrição</label>
            <input
              required={!isExterna}
              value={form.descricao}
              onChange={(e) => updateForm('descricao', e.target.value)}
              disabled={isExterna}
              className={inputClass(isExterna)}
            />
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Insumos</h2>
            <div className="flex items-center gap-4">
              {custoPreview > 0 && (
                <span className="text-sm font-medium text-gray-700">
                  Custo: <span className="text-blue-600">{formatCurrency(custoPreview)}</span>
                </span>
              )}
              {!isExterna && (
                <button
                  type="button"
                  onClick={addItem}
                  className="text-sm text-blue-600 hover:underline"
                >
                  + Adicionar linha
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {itens.map((item, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  {index === 0 && <label className="text-xs font-medium text-gray-600">Insumo</label>}
                  <select
                    value={item.insumo_id}
                    onChange={(e) => updateItem(index, 'insumo_id', e.target.value)}
                    disabled={isExterna}
                    className={inputClass(isExterna)}
                  >
                    <option value="">Selecione...</option>
                    {insumos.map((ins) => (
                      <option key={ins.id} value={ins.id}>
                        {ins.codigo} — {ins.descricao} ({ins.unidade})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-28 space-y-1">
                  {index === 0 && <label className="text-xs font-medium text-gray-600">Índice</label>}
                  <input
                    type="number"
                    min="0.000001"
                    step="any"
                    placeholder="0.0000"
                    value={item.indice}
                    onChange={(e) => updateItem(index, 'indice', e.target.value)}
                    disabled={isExterna}
                    className={inputClass(isExterna)}
                  />
                </div>
                {itens.length > 1 && !isExterna && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="mb-[1px] text-red-400 hover:text-red-600 px-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          {!isExterna && (
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar alterações'}
            </button>
          )}
          <Link href={`/composicoes/${id}`} className="rounded-md border px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {isExterna ? 'Voltar' : 'Cancelar'}
          </Link>
        </div>
      </form>
    </div>
  );
}
