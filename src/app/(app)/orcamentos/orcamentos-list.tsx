'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/costs';
import { EditableCell } from '@/components/editable-cell';

type OrcRow = {
  id: string;
  nome_obra: string;
  cliente: string | null;
  data: string;
  bdi_global: number;
  tabela_itens_orcamento: { id: string }[];
};

interface Props {
  initialOrcamentos: OrcRow[];
  totaisMap: Record<string, number>;
}

export function OrcamentosGrid({ initialOrcamentos, totaisMap }: Props) {
  const [orcamentos, setOrcamentos] = useState(initialOrcamentos);

  async function save(id: string, field: string, raw: string): Promise<void> {
    let val: string | number | null = raw;
    if (field === 'bdi_global') {
      const n = parseFloat(raw);
      if (isNaN(n) || n < 0) throw new Error('BDI inválido');
      val = n;
    }
    if (field === 'cliente') val = raw.trim() || null;
    if (field === 'nome_obra' && !raw.trim()) throw new Error('Nome obrigatório');

    console.log('[orcamentos] update', { id, field, val });
    const sb = createClient() as any;
    const { data, error } = await sb
      .from('tabela_orcamentos')
      .update({ [field]: val })
      .eq('id', id)
      .select('id');
    if (error) {
      console.error('[orcamentos] update error', error);
      throw error;
    }
    if (!data?.length) {
      console.error('[orcamentos] update bloqueado por RLS — 0 linhas', { id, field });
      throw new Error('Sem permissão para atualizar este orçamento.');
    }
    console.log('[orcamentos] update ok', { id, field, val });
    setOrcamentos(prev => prev.map(o => o.id !== id ? o : { ...o, [field]: val }));
  }

  if (orcamentos.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
        <p className="text-gray-400">Nenhum orçamento criado.</p>
        <Link href="/orcamentos/novo" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Criar primeiro orçamento →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {orcamentos.map((orc) => (
        <div key={orc.id} className="rounded-xl border bg-white p-5 shadow-sm hover:border-blue-100 transition-colors">
          <EditableCell
            value={orc.nome_obra}
            onSave={(v) => save(orc.id, 'nome_obra', v)}
            className="font-semibold text-gray-900 truncate"
          />
          <EditableCell
            value={orc.cliente ?? ''}
            display={orc.cliente ?? undefined}
            onSave={(v) => save(orc.id, 'cliente', v)}
            className="mt-0.5 text-sm text-gray-500 truncate"
          />
          <Link href={`/orcamentos/${orc.id}`} className="mt-3 block group">
            <p className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
              {formatCurrency(totaisMap[orc.id] ?? 0)}
            </p>
          </Link>
          <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
            <span>{orc.tabela_itens_orcamento.length} item(ns)</span>
            <span className="flex items-center gap-1">
              BDI{' '}
              <EditableCell
                value={String(orc.bdi_global)}
                display={`${orc.bdi_global}%`}
                type="number"
                min="0"
                step="0.01"
                onSave={(v) => save(orc.id, 'bdi_global', v)}
                className="text-xs text-gray-400"
              />
            </span>
            <Link
              href={`/orcamentos/${orc.id}`}
              className="hover:underline hover:text-blue-600 transition-colors"
            >
              {new Date(orc.data).toLocaleDateString('pt-BR')}
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
