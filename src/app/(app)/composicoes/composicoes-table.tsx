'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/costs';
import { EditableCell } from '@/components/editable-cell';

type ComposicaoRow = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  custo_unitario: number;
};

export function ComposicoesTable({ initialComposicoes }: { initialComposicoes: ComposicaoRow[] }) {
  const [composicoes, setComposicoes] = useState(initialComposicoes);

  async function save(id: string, field: 'codigo' | 'descricao' | 'unidade', raw: string): Promise<void> {
    const val = raw.trim();
    if (!val) throw new Error('Campo obrigatório');
    console.log('[composicoes] update', { id, field, val });
    const sb = createClient() as any;
    const { data, error } = await sb
      .from('tabela_composicoes')
      .update({ [field]: val })
      .eq('id', id)
      .select('id');
    if (error) {
      console.error('[composicoes] update error', error);
      throw error;
    }
    if (!data?.length) {
      console.error('[composicoes] update bloqueado por RLS — 0 linhas', { id, field });
      throw new Error('Sem permissão — aplique a migration de políticas RLS no Supabase.');
    }
    console.log('[composicoes] update ok', { id, field, val });
    setComposicoes(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c));
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Descrição</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Unidade</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Custo unitário</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {composicoes.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50/30 group">
              <td className="px-3 py-1.5 w-28">
                <EditableCell
                  value={c.codigo}
                  onSave={(v) => save(c.id, 'codigo', v)}
                  className="font-mono text-xs text-gray-600"
                />
              </td>
              <td className="px-3 py-1.5">
                <EditableCell
                  value={c.descricao}
                  onSave={(v) => save(c.id, 'descricao', v)}
                  className="text-gray-900"
                />
              </td>
              <td className="px-3 py-1.5 w-20">
                <EditableCell
                  value={c.unidade}
                  onSave={(v) => save(c.id, 'unidade', v)}
                  className="text-gray-600"
                />
              </td>
              <td className="px-3 py-1.5 text-right font-medium text-gray-900 w-32">
                {formatCurrency(c.custo_unitario)}
              </td>
              <td className="px-3 py-1.5 w-12 text-right">
                <Link
                  href={`/composicoes/${c.id}`}
                  className="text-blue-600 hover:underline opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Ver
                </Link>
              </td>
            </tr>
          ))}
          {composicoes.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                Nenhuma composição encontrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
