'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { baseLabelFromOrgao } from '@/components/base-labels';

const GRUPOS = [
  { value: 'E',  label: 'Equipamento' },
  { value: 'H',  label: 'Mão de Obra' },
  { value: 'HH', label: 'Mão de obra Horista' },
  { value: 'M',  label: 'Material' },
  { value: 'N',  label: 'Material' },
  { value: 'O',  label: 'Material' },
  { value: 'P',  label: 'Material' },
  { value: 'Q',  label: 'Material' },
  { value: 'R',  label: 'Material' },
  { value: 'S',  label: 'Serviço de Terceiros' },
  { value: 'T',  label: 'Transporte' },
];

export default function EditarInsumoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [fetching, setFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grupoOpen, setGrupoOpen] = useState(false);
  const [grupos, setGrupos] = useState<string[]>([]);
  const grupoRef = useRef<HTMLDivElement>(null);
  const [baseInfo, setBaseInfo] = useState<{ orgao: string; tipo_base: string } | null>(null);
  const [form, setForm] = useState({
    codigo: '',
    descricao: '',
    unidade: '',
    preco_base: '',
    data_referencia: '',
    observacao: '',
  });

  useEffect(() => {
    async function load() {
      const sb = createClient() as any;
      const res = await sb
        .from('tabela_insumos')
        .select('*, tabela_bases(orgao, tipo_base)')
        .eq('id', id)
        .single();
      if (res.error || !res.data) {
        setError('Insumo não encontrado.');
        setFetching(false);
        return;
      }
      const d = res.data;
      setForm({
        codigo: d.codigo,
        descricao: d.descricao,
        unidade: d.unidade,
        preco_base: String(d.preco_base),
        data_referencia: d.data_referencia ?? '',
        observacao: d.observacao ?? '',
      });
      setGrupos(d.grupo ? d.grupo.split(',') : []);
      setBaseInfo(d.tabela_bases ?? null);
      setFetching(false);
    }
    load();
  }, [id]);

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (grupoRef.current && !grupoRef.current.contains(e.target as Node)) setGrupoOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleGrupo(value: string) {
    setGrupos((prev) => prev.includes(value) ? prev.filter(g => g !== value) : [...prev, value]);
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!form.codigo.trim() || !form.descricao.trim() || !form.unidade.trim()) {
      setError('Preencha código, descrição e unidade.');
      return;
    }
    const preco = parseFloat(form.preco_base);
    if (isNaN(preco) || preco < 0) { setError('Custo inválido.'); return; }

    setLoading(true);
    try {
      const sb = createClient() as any;
      const payload = {
        codigo: form.codigo.trim(),
        descricao: form.descricao.trim(),
        unidade: form.unidade.trim(),
        grupo: grupos.length > 0 ? grupos.join(',') : null,
        preco_base: preco,
        data_referencia: form.data_referencia || null,
        observacao: form.observacao.trim() || null,
      };
      const { data: updated, error: dbError } = await sb
        .from('tabela_insumos')
        .update(payload)
        .eq('id', id)
        .select('id');
      if (dbError) throw dbError;
      if (!updated?.length) throw new Error('RLS bloqueou o update.');
      router.refresh();
      router.push('/insumos');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '';
      setError(msg.includes('tabela_insumos_codigo')
        ? 'Já existe um insumo com esse código nesta base.'
        : 'Erro ao salvar. Tente novamente.');
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Excluir este insumo? Esta ação não pode ser desfeita.')) return;
    setLoading(true);
    try {
      const sb = createClient() as any;
      const { error: dbError } = await sb.from('tabela_insumos').delete().eq('id', id);
      if (dbError) throw dbError;
      router.refresh();
      router.push('/insumos');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '';
      setError(msg.includes('itens_composicao')
        ? 'Insumo em uso por composições — não é possível excluir.'
        : 'Erro ao excluir. Tente novamente.');
      setLoading(false);
    }
  }

  if (fetching) return <div className="py-20 text-center text-sm text-gray-400">Carregando...</div>;

  const isExterna = baseInfo?.tipo_base === 'externa';
  const grupoLabel = grupos.length === 0 ? 'Selecione...' : grupos.join(', ');
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
          <Link href="/insumos" className="text-sm text-blue-600 hover:underline">← Insumos</Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">
            {isExterna ? 'Visualizar insumo' : 'Editar insumo'}
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
          Este insumo pertence à base externa <strong>{baseInfo?.orgao}</strong> e não pode ser editado.
          Para criar uma versão personalizada, use <Link href="/insumos/novo" className="underline">Novo insumo</Link>.
        </div>
      )}

      <form onSubmit={isExterna ? (e) => e.preventDefault() : handleSubmit} className="space-y-5">
        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-900">Identificação</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Código</label>
              <input
                required={!isExterna}
                value={form.codigo}
                onChange={(e) => update('codigo', e.target.value)}
                disabled={isExterna}
                className={inputClass(isExterna)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Unidade</label>
              <input
                required={!isExterna}
                value={form.unidade}
                onChange={(e) => update('unidade', e.target.value)}
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
              onChange={(e) => update('descricao', e.target.value)}
              disabled={isExterna}
              className={inputClass(isExterna)}
            />
          </div>
          <div className="space-y-1" ref={grupoRef}>
            <label className="text-sm font-medium text-gray-700">Grupo</label>
            <div className="relative">
              <button
                type="button"
                disabled={isExterna}
                onClick={() => !isExterna && setGrupoOpen(o => !o)}
                className={`w-full rounded-md border px-3 py-2 text-sm text-left flex items-center justify-between ${
                  isExterna
                    ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                    : 'border-gray-300 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white'
                }`}
              >
                <span className={grupos.length === 0 ? 'text-gray-400' : 'text-gray-900'}>{grupoLabel}</span>
                {!isExterna && (
                  <svg className={`h-4 w-4 text-gray-400 transition-transform ${grupoOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </button>
              {grupoOpen && !isExterna && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg py-1">
                  {GRUPOS.map((g) => (
                    <label key={g.value} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={grupos.includes(g.value)}
                        onChange={() => toggleGrupo(g.value)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-mono text-xs text-gray-500 w-6">{g.value}</span>
                      <span className="text-gray-900">{g.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-900">Custo e referência</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Custo (R$)</label>
              <input
                required={!isExterna}
                type="number"
                min="0"
                step="0.0001"
                placeholder="0,0000"
                value={form.preco_base}
                onChange={(e) => update('preco_base', e.target.value)}
                disabled={isExterna}
                className={inputClass(isExterna)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Data de referência</label>
              <input
                type="date"
                value={form.data_referencia}
                onChange={(e) => update('data_referencia', e.target.value)}
                disabled={isExterna}
                className={inputClass(isExterna)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Observação</label>
            <textarea
              rows={2}
              value={form.observacao}
              onChange={(e) => update('observacao', e.target.value)}
              disabled={isExterna}
              placeholder="Informações adicionais"
              className={`${inputClass(isExterna)} resize-none`}
            />
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
          <Link href="/insumos" className="rounded-md border px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            {isExterna ? 'Voltar' : 'Cancelar'}
          </Link>
        </div>
      </form>
    </div>
  );
}
