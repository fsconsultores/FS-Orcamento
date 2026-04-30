'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

const GRUPOS = [
  { value: 'E',  label: 'E — Equipamento' },
  { value: 'H',  label: 'H — Mão de Obra' },
  { value: 'HH', label: 'HH — Mão de obra Horista' },
  { value: 'M',  label: 'M — Material' },
  { value: 'N',  label: 'N — Material' },
  { value: 'O',  label: 'O — Material' },
  { value: 'P',  label: 'P — Material' },
  { value: 'Q',  label: 'Q — Material' },
  { value: 'R',  label: 'R — Material' },
  { value: 'S',  label: 'S — Serviço de Terceiros' },
  { value: 'T',  label: 'T — Transporte' },
];

export default function NovoInsumoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grupoOpen, setGrupoOpen] = useState(false);
  const [grupos, setGrupos] = useState<string[]>([]);
  const grupoRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
    codigo: '',
    descricao: '',
    unidade: '',
    preco_base: '',
    data_referencia: '',
    observacao: '',
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (grupoRef.current && !grupoRef.current.contains(e.target as Node)) {
        setGrupoOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleGrupo(value: string) {
    setGrupos((prev) =>
      prev.includes(value) ? prev.filter((g) => g !== value) : [...prev, value]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.codigo.trim() || !form.descricao.trim() || !form.unidade.trim()) {
      setError('Preencha código, descrição e unidade.');
      return;
    }
    const preco = parseFloat(form.preco_base);
    if (isNaN(preco) || preco < 0) {
      setError('Custo inválido.');
      return;
    }

    setLoading(true);
    try {
      const sb = createClient() as any;
      const { error: dbError } = await sb.from('tabela_insumos').insert({
        codigo: form.codigo.trim(),
        descricao: form.descricao.trim(),
        unidade: form.unidade.trim(),
        grupo: grupos.length > 0 ? grupos.join(',') : null,
        preco_base: preco,
        data_referencia: form.data_referencia || null,
        observacao: form.observacao.trim() || null,
      });
      if (dbError) throw dbError;
      router.refresh();
      router.push('/insumos');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.includes('tabela_insumos_codigo_key')) {
        setError('Já existe um insumo com esse código.');
      } else {
        setError('Erro ao salvar. Tente novamente.');
      }
      setLoading(false);
    }
  }

  const grupoLabel =
    grupos.length === 0 ? 'Selecione...' : grupos.join(', ');

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link href="/insumos" className="text-sm text-blue-600 hover:underline">
          ← Insumos
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Novo insumo</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-900">Identificação</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Código *</label>
              <input
                required
                value={form.codigo}
                onChange={(e) => update('codigo', e.target.value)}
                placeholder="Ex: 00001.1"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Unidade *</label>
              <input
                required
                value={form.unidade}
                onChange={(e) => update('unidade', e.target.value)}
                placeholder="Ex: kg, m², un, h"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Descrição *</label>
            <input
              required
              value={form.descricao}
              onChange={(e) => update('descricao', e.target.value)}
              placeholder="Ex: Cimento Portland CP-II 50kg"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="space-y-1" ref={grupoRef}>
            <label className="text-sm font-medium text-gray-700">Grupo</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setGrupoOpen((o) => !o)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-left outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 flex items-center justify-between bg-white"
              >
                <span className={grupos.length === 0 ? 'text-gray-400' : 'text-gray-900'}>
                  {grupoLabel}
                </span>
                <svg
                  className={`h-4 w-4 text-gray-400 transition-transform ${grupoOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {grupoOpen && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg py-1">
                  {GRUPOS.map((g) => (
                    <label
                      key={g.value}
                      className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={grupos.includes(g.value)}
                        onChange={() => toggleGrupo(g.value)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="font-mono text-xs text-gray-500 w-6">{g.value}</span>
                      <span className="text-gray-900">{g.label.split(' — ')[1]}</span>
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
              <label className="text-sm font-medium text-gray-700">Custo (R$) *</label>
              <input
                required
                type="number"
                min="0"
                step="0.0001"
                placeholder="0,0000"
                value={form.preco_base}
                onChange={(e) => update('preco_base', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Data de referência</label>
              <input
                type="date"
                value={form.data_referencia}
                onChange={(e) => update('data_referencia', e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Observação</label>
            <textarea
              rows={2}
              value={form.observacao}
              onChange={(e) => update('observacao', e.target.value)}
              placeholder="Informações adicionais sobre o insumo"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 resize-none"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Salvar insumo'}
          </button>
          <Link
            href="/insumos"
            className="rounded-md border px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}