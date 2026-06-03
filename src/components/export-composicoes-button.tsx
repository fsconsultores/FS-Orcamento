'use client';

import { useState } from 'react';

export type ComposicaoParaExport = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  custo_unitario: number;
  insumos?: {
    codigo: string;
    descricao: string;
    unidade: string;
    custo: number;
    indice: number;
    grupo?: string | null;
  }[];
};

export function ExportComposicoesButton({
  composicoes,
}: {
  composicoes: ComposicaoParaExport[];
}) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleClick() {
    if (loading || !composicoes?.length) return;
    setLoading(true);
    setErro(null);
    try {
      const XLSX = await import('xlsx-js-style');

      const headers = ['Código', 'Descrição', 'Und', 'Índice', 'R$ Unit.', 'R$ Parcial'];
      const aoa: (string | number)[][] = [headers];
      const compRows: number[] = [];
      const insumoRows: number[] = [];

      for (const comp of composicoes) {
        aoa.push([
          comp.codigo,
          comp.descricao.toUpperCase(),
          comp.unidade,
          '',
          comp.custo_unitario ?? 0,
          comp.custo_unitario ?? 0,
        ]);
        compRows.push(aoa.length - 1);

        for (const ins of comp.insumos ?? []) {
          aoa.push([
            ins.codigo,
            ins.descricao,
            ins.unidade,
            ins.indice,
            ins.custo,
            ins.indice * ins.custo,
          ]);
          insumoRows.push(aoa.length - 1);
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = [
        { wch: 13 }, { wch: 55 }, { wch: 7 },
        { wch: 12 }, { wch: 14 }, { wch: 14 },
      ];

      const boldStyle = { font: { bold: true } };
      const indentStyle = { alignment: { indent: 2 } };

      for (const rowIdx of compRows) {
        for (const col of ['A', 'B', 'C', 'D', 'E', 'F']) {
          const ref = `${col}${rowIdx + 1}`;
          if (ws[ref]) ws[ref].s = boldStyle;
        }
      }

      for (const rowIdx of insumoRows) {
        for (const col of ['A', 'B']) {
          const ref = `${col}${rowIdx + 1}`;
          if (ws[ref]) ws[ref].s = indentStyle;
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Composições');
      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `composicoes_${today}.xlsx`);
    } catch (err) {
      console.error('[ExportComposicoes]', err);
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
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
      {erro && <p className="text-xs text-red-600 max-w-xs text-right">{erro}</p>}
    </div>
  );
}
