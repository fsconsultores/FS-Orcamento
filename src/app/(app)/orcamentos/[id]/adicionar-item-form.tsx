'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Composicao = { id: string; codigo: string; descricao: string; unidade: string; custo_unitario: number };

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
  const [busca, setBusca] = useState('');
  const [selectedComp, setSelectedComp] = useState<Composicao | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [quantidade, setQuantidade] = useState('');
  const [bdiEspecifico, setBdiEspecifico] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtradas = busca.trim()
    ? composicoes.filter(
        (c) =>
          c.codigo.toLowerCase().includes(busca.toLowerCase()) ||
          c.descricao.toLowerCase().includes(busca.toLowerCase())
      ).slice(0, 12)
    : composicoes.slice(0, 12);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function selectComp(c: Composicao) {
    setSelectedComp(c);
    setBusca(`${c.codigo} — ${c.descricao}`);
    setShowDropdown(false);
  }

  function handleBuscaChange(value: string) {
    setBusca(value);
    setSelectedComp(null);
    setShowDropdown(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedComp) { setError('Selecione uma composição.'); return; }
    const qtd = parseFloat(quantidade);
    if (isNaN(qtd) || qtd <= 0) { setError('Quantidade inválida.'); return; }
    const bdiEsp = bdiEspecifico !== '' ? parseFloat(bdiEspecifico) : null;
    if (bdiEsp !== null && (isNaN(bdiEsp) || bdiEsp < 0)) { setError('BDI específico inválido.'); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: dbError } = await supabase.from('tabela_itens_orcamento').insert({
        orcamento_id: orcamentoId,
        composicao_id: selectedComp.id,
        quantidade: qtd,
        bdi_especifico: bdiEsp,
      });
      if (dbError) throw dbError;
      setBusca('');
      setSelectedComp(null);
      setQuantidade('');
      setBdiEspecifico('');
      router.refresh();
    } catch {
      setError('Erro ao adicionar item.');
    } finally {
      setLoading(false);
    }
  }

  const custoPreview =
    selectedComp && quantidade && !isNaN(parseFloat(quantidade))
      ? selectedComp.custo_unitario * parseFloat(quantidade)
      : null;

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold text-gray-900">Adicionar composição</h2>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">

        {/* Busca de composição */}
        <div className="flex-1 min-w-[260px] space-y-1" ref={dropdownRef}>
          <label className="text-xs font-medium text-gray-600">Composição *</label>
          <div className="relative">
            <input
              type="text"
              value={busca}
              onChange={(e) => handleBuscaChange(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              placeholder="Buscar por código ou descrição..."
              autoComplete="off"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            {showDropdown && filtradas.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
                {filtradas.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => selectComp(c)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-blue-50"
                  >
                    <span>
                      <span className="font-mono text-xs text-gray-400 mr-2">{c.codigo}</span>
                      {c.descricao}
                    </span>
                    <span className="ml-3 shrink-0 text-xs text-gray-400">{c.unidade}</span>
                  </button>
                ))}
                {busca && filtradas.length === 12 && (
                  <p className="px-3 py-1.5 text-xs text-gray-400">Refinando busca para ver mais...</p>
                )}
              </div>
            )}
          </div>
          {selectedComp && (
            <p className="text-xs text-gray-500">
              Custo unit.: <span className="font-medium text-gray-700">
                {selectedComp.custo_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span> / {selectedComp.unidade}
            </p>
          )}
        </div>

        {/* Quantidade */}
        <div className="w-28 space-y-1">
          <label className="text-xs font-medium text-gray-600">Quantidade *</label>
          <input
            type="number"
            min="0.0001"
            step="any"
            placeholder="0,00"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* BDI específico */}
        <div className="w-32 space-y-1">
          <label className="text-xs font-medium text-gray-600">
            BDI espec. <span className="text-gray-400">(padrão: {bdiGlobal}%)</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder={`${bdiGlobal}`}
            value={bdiEspecifico}
            onChange={(e) => setBdiEspecifico(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="space-y-1">
          {custoPreview !== null && (
            <p className="text-xs text-gray-500">
              Subtotal:{' '}
              <span className="font-semibold text-gray-800">
                {custoPreview.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </form>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
