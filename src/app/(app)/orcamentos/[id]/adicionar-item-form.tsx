'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { baseLabelFromOrgao } from '@/components/base-labels';
import { logAction } from '@/lib/log';

type Composicao = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  custo_unitario: number;
  orgao: string | null;
  tipo: 'shared' | 'proprio'; // 'shared' = biblioteca, 'proprio' = orcamento_composicoes
};

function highlight(text: string, query: string) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase().trim());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-100 text-gray-900 rounded-[2px]">{text.slice(idx, idx + query.trim().length)}</mark>
      {text.slice(idx + query.trim().length)}
    </>
  );
}

export function AdicionarItemForm({
  orcamentoId,
  bdiGlobal,
}: {
  orcamentoId: string;
  bdiGlobal: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Composicao[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [selectedComp, setSelectedComp] = useState<Composicao | null>(null);

  const [quantidade, setQuantidade] = useState('');
  const [bdiEspecifico, setBdiEspecifico] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    const query = q.trim();
    if (!query) { setResultados([]); setSearching(false); return; }
    setSearching(true);
    try {
      const sb = createClient() as any;

      // Busca em paralelo: biblioteca compartilhada + composições próprias do orçamento
      const [resShared, resProprias] = await Promise.all([
        sb.from('vw_custo_composicao')
          .select('id, codigo, descricao, unidade, custo_unitario, orgao')
          .or(`codigo.ilike.%${query}%,descricao.ilike.%${query}%`)
          .order('codigo')
          .limit(10),
        sb.from('orcamento_composicoes')
          .select('id, codigo, descricao, unidade, base')
          .eq('orcamento_id', orcamentoId)
          .or(`codigo.ilike.%${query}%,descricao.ilike.%${query}%`)
          .order('codigo')
          .limit(8),
      ]);

      const proprias: any[] = resProprias.data ?? [];

      // Calcula custo_unitario das composições próprias somando insumos vinculados
      let custoPropMap: Record<string, number> = {};
      if (proprias.length > 0) {
        const { data: insData } = await sb
          .from('orcamento_insumos')
          .select('composicao_id, custo')
          .in('composicao_id', proprias.map((c: any) => c.id));
        for (const ins of insData ?? []) {
          custoPropMap[ins.composicao_id] = (custoPropMap[ins.composicao_id] ?? 0) + (ins.custo ?? 0);
        }
      }

      const shared: Composicao[] = (resShared.data ?? []).map((c: any) => ({ ...c, tipo: 'shared' as const }));
      const proprio: Composicao[] = proprias.map((c: any) => ({
        id: c.id,
        codigo: c.codigo,
        descricao: c.descricao,
        unidade: c.unidade,
        custo_unitario: custoPropMap[c.id] ?? 0,
        orgao: c.base ?? null,
        tipo: 'proprio' as const,
      }));

      setResultados([...proprio, ...shared]);
      setActiveIdx(-1);
    } finally {
      setSearching(false);
    }
  }, [orcamentoId]);

  function handleChange(value: string) {
    setBusca(value);
    setSelectedComp(null);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(value), 200);
  }

  function select(c: Composicao) {
    setSelectedComp(c);
    setBusca(`${c.codigo} — ${c.descricao}`);
    setOpen(false);
    setActiveIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true);
      return;
    }
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => {
        const next = Math.min(i + 1, resultados.length - 1);
        scrollItem(next);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => {
        const prev = Math.max(i - 1, 0);
        scrollItem(prev);
        return prev;
      });
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      select(resultados[activeIdx]);
    }
  }

  function scrollItem(idx: number) {
    if (!listRef.current) return;
    const item = listRef.current.children[idx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!selectedComp) { setError('Selecione uma composição.'); return; }
    const qtd = parseFloat(quantidade);
    if (isNaN(qtd) || qtd <= 0) { setError('Quantidade inválida.'); return; }
    const bdiEsp = bdiEspecifico !== '' ? parseFloat(bdiEspecifico) : null;
    if (bdiEsp !== null && (isNaN(bdiEsp) || bdiEsp < 0)) { setError('BDI inválido.'); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const itemPayload = selectedComp.tipo === 'proprio'
        ? { orcamento_id: orcamentoId, orcamento_composicao_id: selectedComp.id, quantidade: qtd, bdi_especifico: bdiEsp }
        : { orcamento_id: orcamentoId, composicao_id: selectedComp.id, quantidade: qtd, bdi_especifico: bdiEsp };

      const { error: dbError } = await (supabase as any).from('tabela_itens_orcamento').insert(itemPayload);
      if (dbError) throw new Error(dbError.message ?? JSON.stringify(dbError));

      // Reseta o form e atualiza a página antes do log (log não bloqueia sucesso)
      setBusca(''); setSelectedComp(null); setResultados([]);
      setQuantidade(''); setBdiEspecifico('');
      router.refresh();

      const { data: { user } } = await supabase.auth.getUser();
      logAction(supabase, {
        usuario: user?.email ?? '',
        tipo: 'sucesso',
        acao: 'adicionar_item',
        mensagem: `Item "${selectedComp.descricao}" adicionado ao orçamento`,
      }).catch(console.error);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Erro ao adicionar item: ${msg}`);
      console.error('[AdicionarItem]', err);
    } finally {
      setLoading(false);
    }
  }

  const rawQuery = selectedComp ? '' : busca;
  const custoPreview =
    selectedComp && quantidade && !isNaN(parseFloat(quantidade))
      ? selectedComp.custo_unitario * parseFloat(quantidade)
      : null;

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold text-gray-900">Adicionar composição</h2>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">

        {/* ── Autocomplete ── */}
        <div className="flex-1 min-w-[300px] space-y-1" ref={wrapRef}>
          <label className="text-xs font-medium text-gray-600">Composição *</label>
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={busca}
              onChange={e => handleChange(e.target.value)}
              onFocus={() => { if (busca && !selectedComp) setOpen(true); }}
              onKeyDown={handleKeyDown}
              placeholder="Digite código ou descrição..."
              autoComplete="off"
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 ${
                selectedComp
                  ? 'border-blue-400 bg-blue-50 focus:border-blue-500'
                  : 'border-gray-300 focus:border-blue-500'
              }`}
            />

            {/* Spinner */}
            {searching && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              </span>
            )}

            {/* Clear button */}
            {selectedComp && (
              <button
                type="button"
                onClick={() => { setSelectedComp(null); setBusca(''); setResultados([]); inputRef.current?.focus(); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                ✕
              </button>
            )}

            {/* Dropdown */}
            {open && resultados.length > 0 && (
              <div
                ref={listRef}
                className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg"
                role="listbox"
              >
                {resultados.map((c, idx) => (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={idx === activeIdx}
                    onMouseDown={() => select(c)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className={`flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                      idx === activeIdx ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className="flex items-baseline gap-2 min-w-0">
                      <span className="font-mono text-xs text-blue-600 shrink-0">
                        {highlight(c.codigo, rawQuery)}
                      </span>
                      <span className="truncate text-gray-800">
                        {highlight(c.descricao, rawQuery)}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      {c.tipo === 'proprio' ? (
                        <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                          Própria
                        </span>
                      ) : c.orgao ? (
                        <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-medium">
                          {baseLabelFromOrgao(c.orgao)}
                        </span>
                      ) : null}
                      <span className="text-xs text-gray-400">{c.unidade}</span>
                      <span className="text-xs font-medium text-gray-600">
                        {c.custo_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </span>
                    </span>
                  </button>
                ))}
                {resultados.length === 15 && (
                  <p className="px-3 py-1.5 text-xs text-gray-400 border-t">
                    Refinando a busca para ver mais resultados…
                  </p>
                )}
              </div>
            )}

            {/* Mensagem quando busca não retornou nada */}
            {open && !searching && busca.trim() && resultados.length === 0 && (
              <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-200 bg-white px-3 py-3 text-sm text-gray-400 shadow-lg">
                Nenhuma composição encontrada para "{busca}".
              </div>
            )}
          </div>

          {/* Info da composição selecionada */}
          {selectedComp && (
            <p className="text-xs text-gray-500">
              Custo unit.:{' '}
              <span className="font-medium text-gray-700">
                {selectedComp.custo_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
              {' '}/ {selectedComp.unidade}
              {selectedComp.orgao && (
                <span className="ml-2 text-gray-400">· {baseLabelFromOrgao(selectedComp.orgao)}</span>
              )}
            </p>
          )}
        </div>

        {/* ── Quantidade ── */}
        <div className="w-28 space-y-1">
          <label className="text-xs font-medium text-gray-600">Quantidade *</label>
          <input
            type="number"
            min="0.0001"
            step="any"
            placeholder="0,00"
            value={quantidade}
            onChange={e => setQuantidade(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* ── BDI específico ── */}
        <div className="w-36 space-y-1">
          <label className="text-xs font-medium text-gray-600">
            BDI <span className="text-gray-400 font-normal">(padrão {bdiGlobal}%)</span>
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder={`${bdiGlobal}`}
            value={bdiEspecifico}
            onChange={e => setBdiEspecifico(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* ── Botão ── */}
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
            disabled={loading || !selectedComp}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-opacity"
          >
            {loading ? 'Adicionando…' : 'Adicionar'}
          </button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
