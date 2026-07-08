'use client';

import { useState } from 'react';

// Colunas na mesma posição fixa (0-indexed) que src/app/(app)/composicoes/importar/page.tsx
// espera ao ler o arquivo: 0 Codigo, 1 DescricaoAbreviada, 2 Unidade, 3 TipoItemComposicao,
// 4 CodigoDoInsumo, 5 DescricaoAbreviadaInsumo, 6 UnidadeInsumo, 7 Indice, 8 GrupoDoInsumo.
const HEADERS = [
  'Codigo', 'DescricaoAbreviada', 'Unidade', 'TipoItemComposicao', 'CodigoDoInsumo',
  'DescricaoAbreviadaInsumo', 'UnidadeInsumo', 'Indice', 'GrupoDoInsumo',
];

const NOTAS: Record<number, string> = {
  0: 'Código da composição. Repita apenas na primeira linha do serviço — nas linhas seguintes (mesmos insumos) deixe em branco.',
  1: 'Descrição da composição. Só é lida na primeira linha do serviço.',
  2: 'Unidade da composição (M2, M3, UN...). Só é lida na primeira linha do serviço.',
  3: "Use 'I' para insumo normal ou 'C' para sub-composição auxiliar (apenas informativo).",
  4: 'Código do insumo desta linha.',
  5: 'Descrição do insumo.',
  6: 'Unidade do insumo.',
  7: 'Índice de consumo do insumo na composição (use ponto ou vírgula decimal).',
  8: "Grupo do insumo: MAT (material), MO (mão de obra), E (equipamento) ou S/SER (serviço de terceiros).",
};

// Linhas de exemplo demonstrando o padrão "carry-forward": os campos da
// composição (0-2) só aparecem na primeira linha de cada serviço.
const EXEMPLO_ROWS: (string | number)[][] = [
  ['0001', 'ALVENARIA DE BLOCO CERAMICO 14 FUROS', 'M2', 'I', 'I0001', 'BLOCO CERAMICO 14 FUROS 9X19X19CM', 'UN', 12.5, 'MAT'],
  ['', '', '', 'I', 'I0002', 'ARGAMASSA DE ASSENTAMENTO', 'M3', 0.015, 'MAT'],
  ['', '', '', 'I', 'I0003', 'PEDREIRO', 'H', 0.8, 'MO'],
];

export function ExportComposicaoModeloButton() {
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
      const ws = wb.addWorksheet('Modelo Composições');

      const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
      const bdr = (argb: string) => ({ style: 'thin' as const, color: { argb } });
      const BORDER = 'FFE2E8F0';

      ws.columns = [
        { width: 12 }, { width: 40 }, { width: 8 }, { width: 16 }, { width: 14 },
        { width: 40 }, { width: 10 }, { width: 9 }, { width: 12 },
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
          cell.alignment = { horizontal: c === 8 ? 'right' : 'left', vertical: 'middle' };
          cell.border = { top: bdr(BORDER), bottom: bdr(BORDER), left: bdr(BORDER), right: bdr(BORDER) };
          if (c === 8 && typeof cell.value === 'number') cell.numFmt = '#,##0.0000';
        });
      }

      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'modelo_importacao_composicoes.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[ExportComposicaoModelo]', err);
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
