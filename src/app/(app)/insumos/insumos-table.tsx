'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/costs';
import { EditableCell } from '@/components/editable-cell';
import type { Insumo } from '@/lib/supabase/types';

const GRUPOS = [
  { value: 'E',  label: 'Equipamento' },
  { value: 'H',  label: 'Mão de Obra' },
  { value: 'HH', label: 'Horista' },
  { value: 'M',  label: 'Material' },
  { value: 'N',  label: 'Material' },
  { value: 'O',  label: 'Material' },
  { value: 'P',  label: 'Material' },
  { value: 'Q',  label: 'Material' },
  { value: 'R',  label: 'Material' },
  { value: 'S',  label: 'Serviço de Terceiros' },
  { value: 'T',  label: 'Transporte' },
];

function GrupoCell({
  insumoId,
  value,
  onChange,
}: {
  insumoId: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(value ? value.split(',') : []);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setSelected(value ? value.split(',') : []);
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  async function toggle(v: string) {
    const next = selected.includes(v) ? selected.filter(g => g !== v) : [...selected, v];
    setSelected(next);
    const newVal = next.join(',') || null;
    setStatus('saving');
    try {
      console.log('[insumos] update grupo', { insumoId, newVal });
      const sb = createClient() as any;
      const { data, error } = await sb
        .from('tabela_insumos')
        .update({ grupo: newVal })
        .eq('id', insumoId)
        .select('id');
      if (error) {
        console.error('[insumos] update grupo error', error);
        throw error;
      }
      if (!data?.length) {
        console.error('[insumos] update grupo bloqueado por RLS — 0 linhas', { insumoId });
        throw new Error('RLS bloqueou o update');
      }
      console.log('[insumos] update grupo ok', { insumoId, newVal });
      onChange(newVal);
      setStatus('idle');
    } catch {
      setSelected(value ? value.split(',') : []);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`block w-full rounded px-1 py-0.5 text-left hover:bg-blue-50 hover:ring-1 hover:ring-blue-200 transition-colors ${status === 'saving' ? 'opacity-50 cursor-wait' : 'cursor-pointer'} ${status === 'error' ? 'ring-1 ring-red-400' : ''}`}
        title="Clique para editar grupo"
      >
        {selected.length === 0
          ? <span className="text-gray-300 font-normal">—</span>
          : selected.map(g => (
              <span key={g} className="mr-0.5 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-600">{g}</span>
            ))
        }
      </button>
      {open && (
        <div className="absolute z-20 left-0 mt-1 w-52 rounded-md border border-gray-200 bg-white shadow-lg py-1">
          {GRUPOS.map(g => (
            <label key={g.value} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selected.includes(g.value)}
                onChange={() => toggle(g.value)}
                disabled={status === 'saving'}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="font-mono text-xs text-gray-500 w-7">{g.value}</span>
              <span className="text-gray-900">{g.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function InsumosTable({ initialInsumos }: { initialInsumos: Insumo[] }) {
  const [insumos, setInsumos] = useState<Insumo[]>(initialInsumos);

  async function save(id: string, field: keyof Insumo, raw: string): Promise<void> {
    let val: string | number | null = raw;
    if (field === 'preco_base') {
      const n = parseFloat(raw);
      if (isNaN(n) || n < 0) throw new Error('Valor inválido');
      val = n;
    }
    if ((field === 'data_referencia' || field === 'observacao') && raw === '') val = null;

    console.log('[insumos] update', { id, field, val });
    const sb = createClient() as any;
    const { data, error } = await sb
      .from('tabela_insumos')
      .update({ [field]: val })
      .eq('id', id)
      .select('id');
    if (error) {
      console.error('[insumos] update error', error);
      throw error;
    }
    if (!data?.length) {
      console.error('[insumos] update bloqueado por RLS — 0 linhas afetadas', { id, field });
      throw new Error('Sem permissão — aplique a migration de políticas RLS no Supabase.');
    }
    console.log('[insumos] update ok', { id, field, val });
    setInsumos(prev => prev.map(ins => ins.id === id ? { ...ins, [field]: val } : ins));
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Descrição</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Grupo</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Unidade</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Custo</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Data ref.</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {insumos.map((ins) => (
            <tr key={ins.id} className="hover:bg-gray-50/30 group">
              <td className="px-3 py-1.5 w-24">
                <EditableCell
                  value={ins.codigo}
                  onSave={(v) => save(ins.id, 'codigo', v.trim())}
                  className="font-mono text-xs text-gray-600"
                />
              </td>
              <td className="px-3 py-1.5">
                <EditableCell
                  value={ins.descricao}
                  onSave={(v) => save(ins.id, 'descricao', v.trim())}
                  className="text-gray-900"
                />
              </td>
              <td className="px-3 py-1.5 w-36">
                <GrupoCell
                  insumoId={ins.id}
                  value={ins.grupo}
                  onChange={(newVal) =>
                    setInsumos(prev => prev.map(i => i.id === ins.id ? { ...i, grupo: newVal } : i))
                  }
                />
              </td>
              <td className="px-3 py-1.5 w-20">
                <EditableCell
                  value={ins.unidade}
                  onSave={(v) => save(ins.id, 'unidade', v.trim())}
                  className="text-gray-600"
                />
              </td>
              <td className="px-3 py-1.5 w-32">
                <EditableCell
                  value={String(ins.preco_base)}
                  display={formatCurrency(ins.preco_base)}
                  type="number"
                  align="right"
                  min="0"
                  step="0.0001"
                  onSave={(v) => save(ins.id, 'preco_base', v)}
                  className="font-medium text-gray-900"
                />
              </td>
              <td className="px-3 py-1.5 w-28">
                <EditableCell
                  value={ins.data_referencia ?? ''}
                  display={ins.data_referencia
                    ? new Date(ins.data_referencia).toLocaleDateString('pt-BR')
                    : undefined}
                  type="date"
                  onSave={(v) => save(ins.id, 'data_referencia', v)}
                  className="text-gray-500"
                />
              </td>
              <td className="px-3 py-1.5 w-14 text-right">
                <Link
                  href={`/insumos/${ins.id}/editar`}
                  className="text-xs text-blue-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Editar
                </Link>
              </td>
            </tr>
          ))}
          {insumos.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                Nenhum insumo encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
