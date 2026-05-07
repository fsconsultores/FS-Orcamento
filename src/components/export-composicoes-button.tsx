'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type ComposicaoBase = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  custo_unitario: number;
};

export function ExportComposicoesButton({ composicoes }: { composicoes: ComposicaoBase[] }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading || composicoes.length === 0) return;
    setLoading(true);
    try {
      const sb = createClient() as any;
      const ids = composicoes.map((c) => c.id);

      const { data: itens, error } = await sb
        .from('tabela_itens_composicao')
        .select('composicao_id, indice, tabela_insumos(codigo, descricao, unidade, preco_base)')
        .in('composicao_id', ids);

      if (error) throw error;

      const byComp = new Map<string, { indice: number; codigo: string; descricao: string; unidade: string; preco_base: number }[]>();
      for (const item of itens ?? []) {
        const ins = item.tabela_insumos;
        if (!ins) continue;
        if (!byComp.has(item.composicao_id)) byComp.set(item.composicao_id, []);
        byComp.get(item.composicao_id)!.push({
          indice: item.indice,
          codigo: ins.codigo,
          descricao: ins.descricao,
          unidade: ins.unidade,
          preco_base: ins.preco_base,
        });
      }

      const rows: Record<string, unknown>[] = [];
      for (const comp of composicoes) {
        const compItens = byComp.get(comp.id) ?? [];
        if (compItens.length === 0) {
          rows.push({
            'Código': comp.codigo,
            'Descrição': comp.descricao,
            'Unidade': comp.unidade,
            'Insumo Código': '',
            'Insumo Descrição': '',
            'Insumo Unidade': '',
            'Índice': '',
            'Custo Item': '',
            'Custo Total': comp.custo_unitario,
          });
        } else {
          for (const item of compItens) {
            const custoItem = item.preco_base * item.indice;
            rows.push({
              'Código': comp.codigo,
              'Descrição': comp.descricao,
              'Unidade': comp.unidade,
              'Insumo Código': item.codigo,
              'Insumo Descrição': item.descricao,
              'Insumo Unidade': item.unidade,
              'Índice': item.indice,
              'Custo Item': custoItem,
              'Custo Total': comp.custo_unitario,
            });
          }
        }
      }

      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 14 }, { wch: 50 }, { wch: 8 },
        { wch: 14 }, { wch: 50 }, { wch: 8 },
        { wch: 10 }, { wch: 14 }, { wch: 14 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Composições');
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `composicoes_${today}.xlsx`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {loading ? 'Exportando...' : 'Exportar XLSX'}
    </button>
  );
}
