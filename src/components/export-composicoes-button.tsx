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
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'FS Orçamento';
      const ws = wb.addWorksheet('Composições');

      const fill  = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
      const bdr   = (argb: string) => ({ style: 'thin' as const, color: { argb } });
      const BORDER = 'FFE2E8F0';

      ws.columns = [
        { width: 13 }, { width: 55 }, { width: 7 },
        { width: 12 }, { width: 14 }, { width: 14 },
      ];

      const hRow = ws.addRow(['Código', 'Descrição', 'Und', 'Índice', 'R$ Unit.', 'R$ Parcial']);
      hRow.height = 16;
      hRow.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.fill = fill('FFF1F5F9');
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF475569' } };
        cell.alignment = { horizontal: c >= 4 ? 'right' : 'left', vertical: 'middle' };
        cell.border = { top: bdr('FF475569'), bottom: bdr('FF475569'), left: bdr(BORDER), right: bdr(BORDER) };
      });

      for (const comp of composicoes) {
        const cRow = ws.addRow([
          comp.codigo,
          comp.descricao.toUpperCase(),
          comp.unidade,
          '',
          comp.custo_unitario ?? '',
          comp.custo_unitario ?? '',
        ]);
        cRow.height = 15;
        cRow.eachCell({ includeEmpty: true }, (cell, c) => {
          cell.fill = fill('FFEFF6FF');
          cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF172554' } };
          cell.alignment = { horizontal: c >= 4 ? 'right' : 'left', vertical: 'middle' };
          cell.border = { top: bdr(BORDER), bottom: bdr(BORDER), left: bdr(BORDER), right: bdr(BORDER) };
          if ((c === 5 || c === 6) && typeof cell.value === 'number') cell.numFmt = '#,##0.00';
        });

        for (const ins of comp.insumos ?? []) {
          const iRow = ws.addRow([
            ins.codigo,
            ins.descricao,
            ins.unidade,
            ins.indice,
            ins.custo,
            ins.indice * ins.custo,
          ]);
          iRow.height = 14;
          iRow.eachCell({ includeEmpty: true }, (cell, c) => {
            cell.fill = fill('FFFFFFFF');
            cell.font = { name: 'Calibri', size: 9, bold: false, color: { argb: 'FF374151' } };
            cell.alignment = { horizontal: c >= 4 ? 'right' : 'left', vertical: 'middle', indent: c <= 2 ? 1 : 0 };
            cell.border = { top: bdr(BORDER), bottom: bdr(BORDER), left: bdr(BORDER), right: bdr(BORDER) };
            if ((c === 5 || c === 6) && typeof cell.value === 'number') cell.numFmt = '#,##0.00';
            if (c === 4 && typeof cell.value === 'number')              cell.numFmt = '#,##0.0000';
          });
        }
      }

      const today = new Date().toISOString().split('T')[0];
      const buf   = await wb.xlsx.writeBuffer();
      const url   = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a     = document.createElement('a');
      a.href = url; a.download = `composicoes_${today}.xlsx`; a.click();
      URL.revokeObjectURL(url);
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
