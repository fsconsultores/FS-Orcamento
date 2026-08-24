'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

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

export type ExportComposicoesFormato = 'sintetica' | 'analitica';

async function gerarXlsx(composicoesData: ComposicaoParaExport[], formato: ExportComposicoesFormato) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FS Orçamento';
  const ws = wb.addWorksheet('Composições');

  const fill  = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
  const bdr   = (argb: string) => ({ style: 'thin' as const, color: { argb } });
  const BORDER = 'FFE2E8F0';

  const analitica = formato === 'analitica';

  ws.columns = analitica
    ? [{ width: 13 }, { width: 55 }, { width: 7 }, { width: 12 }, { width: 14 }, { width: 14 }]
    : [{ width: 13 }, { width: 55 }, { width: 7 }, { width: 14 }];

  const header = analitica
    ? ['Código', 'Descrição', 'Und', 'Índice', 'R$ Unit.', 'R$ Parcial']
    : ['Código', 'Descrição', 'Und', 'R$ Unit.'];

  const hRow = ws.addRow(header);
  hRow.height = 16;
  hRow.eachCell({ includeEmpty: true }, (cell, c) => {
    cell.fill = fill('FFF1F5F9');
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF475569' } };
    cell.alignment = { horizontal: c >= (analitica ? 4 : 3) ? 'right' : 'left', vertical: 'middle' };
    cell.border = { top: bdr('FF475569'), bottom: bdr('FF475569'), left: bdr(BORDER), right: bdr(BORDER) };
  });

  for (const comp of composicoesData) {
    const cRow = ws.addRow(
      analitica
        ? [comp.codigo, comp.descricao.toUpperCase(), comp.unidade, '', comp.custo_unitario ?? '', comp.custo_unitario ?? '']
        : [comp.codigo, comp.descricao.toUpperCase(), comp.unidade, comp.custo_unitario ?? '']
    );
    cRow.height = 15;
    cRow.eachCell({ includeEmpty: true }, (cell, c) => {
      cell.fill = fill('FFEFF6FF');
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF172554' } };
      cell.alignment = { horizontal: c >= (analitica ? 4 : 3) ? 'right' : 'left', vertical: 'middle' };
      cell.border = { top: bdr(BORDER), bottom: bdr(BORDER), left: bdr(BORDER), right: bdr(BORDER) };
      if (typeof cell.value === 'number') cell.numFmt = '#,##0.00';
    });

    if (!analitica) continue;
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
  a.href = url; a.download = `composicoes_${formato}_${today}.xlsx`; a.click();
  URL.revokeObjectURL(url);
}

export function ExportComposicoesButton({
  composicoes,
  fetchComposicoes,
}: {
  /** Linhas já prontas (dataset pequeno, já carregado na tela). */
  composicoes?: ComposicaoParaExport[];
  /**
   * Alternativa a `composicoes` para telas que não pré-carregam o dataset
   * completo (custo em cadeia é caro demais pra calcular só pra alimentar
   * um botão que pode nunca ser clicado) — busca sob demanda ao clicar,
   * mesmo padrão de `ExportXlsxButton`.
   */
  fetchComposicoes?: () => Promise<ComposicaoParaExport[]>;
}) {
  const [open, setOpen] = useState(false);
  const [formato, setFormato] = useState<ExportComposicoesFormato>('analitica');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleExportar() {
    setLoading(true);
    setErro(null);
    try {
      const composicoesData = fetchComposicoes ? await fetchComposicoes() : (composicoes ?? []);
      if (composicoesData.length === 0) return;
      await gerarXlsx(composicoesData, formato);
      setOpen(false);
    } catch (err) {
      console.error('[ExportComposicoes]', err);
      setErro(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Download size={16} />
        Exportar XLSX
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Exportar composições" size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={loading}>Cancelar</Button>
            <Button size="sm" onClick={handleExportar} loading={loading}>Exportar</Button>
          </>
        }
      >
        <div className="space-y-2">
          <FormatoOption
            icon={<FileSpreadsheet size={16} />}
            title="Sintética"
            description="Só o código, descrição, unidade e custo de cada composição."
            selected={formato === 'sintetica'}
            onClick={() => setFormato('sintetica')}
          />
          <FormatoOption
            icon={<FileSpreadsheet size={16} />}
            title="Analítica"
            description="Cada composição com os insumos decompostos (código, índice e custo de cada um)."
            selected={formato === 'analitica'}
            onClick={() => setFormato('analitica')}
          />
          {erro && <p className="text-xs text-red-600">{erro}</p>}
        </div>
      </Modal>
    </>
  );
}

function FormatoOption({ icon, title, description, selected, onClick }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
        selected ? 'border-primary-500 bg-primary-50/60 ring-1 ring-primary-500' : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <span className={`mt-0.5 shrink-0 ${selected ? 'text-primary-700' : 'text-gray-400'}`}>{icon}</span>
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${selected ? 'text-primary-800' : 'text-gray-800'}`}>{title}</span>
        <span className="mt-0.5 block text-xs text-gray-500">{description}</span>
      </span>
    </button>
  );
}
