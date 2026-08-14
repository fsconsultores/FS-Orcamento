'use client';

import { useState } from 'react';

// Cabeçalhos reconhecidos por COL_ALIASES/detectCols em
// src/app/(app)/orcamentos/[id]/importar/import-form.tsx (parseFlat) — a
// leitura é por NOME de coluna (com sinônimos), não por posição fixa, mas
// os nomes abaixo são os "canônicos" que o parser sempre reconhece.
const HEADERS = [
  'Codigo', 'Descricao', 'Unidade', 'Custo', 'Grupo', 'DataRef', 'Fornecedor', 'DataCotacao',
];

const NOTAS: Record<number, string> = {
  0: 'Código do insumo.',
  1: 'Descrição do insumo.',
  2: 'Unidade (UN, M2, M3, KG, H...).',
  3: 'Custo unitário (use ponto ou vírgula decimal).',
  4: 'Grupo: E (equipamento), H/HH (mão de obra), M/N/O/P/Q/R (material), S (serviço de terceiros) ou T (transporte). Opcional.',
  5: 'Data de referência do preço (texto livre, ex: "05/2026"). Opcional.',
  6: 'Fornecedor da cotação. Opcional.',
  7: 'Data da cotação (DD/MM/AAAA). Opcional.',
};

const EXEMPLO_ROWS: (string | number)[][] = [
  ['I0001', 'BLOCO CERAMICO 14 FUROS 9X19X19CM', 'UN', 2.35, 'M', '', '', ''],
  ['I0002', 'ARGAMASSA DE ASSENTAMENTO', 'M3', 480, 'M', '', 'Fornecedor Exemplo Ltda', '15/05/2026'],
  ['I0003', 'PEDREIRO', 'H', 32.5, 'H', '', '', ''],
];

export function ExportInsumoModeloButton() {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setErro(null);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      wb.creator = 'FS Orçamento';
      const ws = wb.addWorksheet('Modelo Insumos');

      const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
      const bdr = (argb: string) => ({ style: 'thin' as const, color: { argb } });
      const BORDER = 'FFE2E8F0';

      ws.columns = [
        { width: 12 }, { width: 40 }, { width: 9 }, { width: 12 },
        { width: 8 }, { width: 12 }, { width: 22 }, { width: 14 },
      ];

      const hRow = ws.addRow(HEADERS);
      hRow.height = 18;
      hRow.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.fill = fill('FFFEF9C3');
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF713F12' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = { top: bdr('FF713F12'), bottom: bdr('FF713F12'), left: bdr(BORDER), right: bdr(BORDER) };
        const nota = NOTAS[c - 1];
        if (nota) cell.note = nota;
      });

      for (const row of EXEMPLO_ROWS) {
        const r = ws.addRow(row);
        r.height = 15;
        r.eachCell({ includeEmpty: true }, (cell, c) => {
          cell.fill = fill('FFFFFFFF');
          cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF374151' } };
          cell.alignment = { horizontal: c === 4 ? 'right' : 'left', vertical: 'middle' };
          cell.border = { top: bdr(BORDER), bottom: bdr(BORDER), left: bdr(BORDER), right: bdr(BORDER) };
          if (c === 4 && typeof cell.value === 'number') cell.numFmt = '#,##0.00';
        });
      }

      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'modelo_importacao_insumos.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[ExportInsumoModelo]', err);
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
            d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H8a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {loading ? 'Gerando...' : 'Exportar modelo'}
      </button>
      {erro && <p className="text-xs text-red-600 max-w-xs text-right">{erro}</p>}
    </div>
  );
}
