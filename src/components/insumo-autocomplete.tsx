'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export type InsumoRow = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  preco_base: number;
};

interface Props {
  value: string;
  onChange: (insumoId: string, row: InsumoRow | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

function insumoLabel(ins: InsumoRow) {
  return `${ins.codigo} — ${ins.descricao} (${ins.unidade})`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function InsumoAutocomplete({ value, onChange, disabled, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<InsumoRow[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  // tracks the last resolved { id, label } so we avoid redundant DB fetches
  const resolvedRef = useRef<{ id: string; label: string } | null>(null);

  // When value prop changes from outside (e.g. loading an existing form), fetch label
  useEffect(() => {
    if (!value) {
      setQuery('');
      resolvedRef.current = null;
      return;
    }
    if (resolvedRef.current?.id === value) return;

    createClient()
      .from('tabela_insumos')
      .select('id, codigo, descricao, unidade, preco_base')
      .eq('id', value)
      .single()
      .then(({ data }) => {
        if (data) {
          const lbl = insumoLabel(data as InsumoRow);
          resolvedRef.current = { id: value, label: lbl };
          setQuery(lbl);
        }
      });
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search — fires 300 ms after query/open changes
  useEffect(() => {
    if (!open || query.length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const q = query.trim();
        const filtro = UUID_RE.test(q)
          ? `id.eq.${q},descricao.ilike.%${q}%,codigo.ilike.%${q}%`
          : `descricao.ilike.%${q}%,codigo.ilike.%${q}%`;

        const { data } = await createClient()
          .from('tabela_insumos')
          .select('id, codigo, descricao, unidade, preco_base')
          .or(filtro)
          .order('codigo')
          .limit(20);

        setResults((data as InsumoRow[]) ?? []);
        setHighlighted(-1);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, open]);

  // Close on click outside — restore label if a value is selected
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (resolvedRef.current) {
          setQuery(resolvedRef.current.label);
        } else if (!value) {
          setQuery('');
        }
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    if (!val) {
      onChange('', null);
      resolvedRef.current = null;
    }
  }

  function handleSelect(ins: InsumoRow) {
    const lbl = insumoLabel(ins);
    resolvedRef.current = { id: ins.id, label: lbl };
    setQuery(lbl);
    onChange(ins.id, ins);
    setOpen(false);
    setResults([]);
    setHighlighted(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlighted(h => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, -1));
    } else if (e.key === 'Enter' && open && highlighted >= 0 && results[highlighted]) {
      e.preventDefault();
      handleSelect(results[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      if (resolvedRef.current) setQuery(resolvedRef.current.label);
    }
  }

  const inputCls = disabled
    ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
    : 'border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => { if (!disabled && query.length >= 2) setOpen(true); }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder ?? 'Buscar por código ou descrição...'}
        autoComplete="off"
        className={`w-full rounded-md border px-3 py-2 text-sm outline-none ${inputCls}`}
      />
      {open && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
          {searching ? (
            <p className="px-3 py-2 text-sm text-gray-400">Buscando...</p>
          ) : query.length < 2 ? (
            <p className="px-3 py-2 text-sm text-gray-400">Digite ao menos 2 caracteres</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">Nenhum resultado</p>
          ) : (
            <ul className="max-h-60 overflow-auto py-1">
              {results.map((ins, i) => (
                <li
                  key={ins.id}
                  onMouseDown={() => handleSelect(ins)}
                  className={`cursor-pointer px-3 py-2 text-sm ${
                    i === highlighted
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span className="font-medium">{ins.codigo}</span>
                  {' — '}
                  {ins.descricao}
                  <span className="ml-1 text-gray-400">({ins.unidade})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
