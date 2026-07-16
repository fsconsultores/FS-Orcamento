'use client';

import { useState } from 'react';

interface ExportXlsxButtonProps {
  /** Linhas já prontas (caso comum: dataset pequeno, já carregado na tela). */
  rows?: Record<string, unknown>[];
  /**
   * Alternativa a `rows` para datasets grandes: busca sob demanda (Server
   * Action) só quando o usuário clica em exportar, em vez de pré-carregar em
   * toda visita à página — importante em bases com dezenas de milhares de
   * itens (ex: SINAPI).
   */
  fetchRows?: () => Promise<Record<string, unknown>[]>;
  sheetName: string;
  fileName: string;
}

export function ExportXlsxButton({ rows, fetchRows, sheetName, fileName }: ExportXlsxButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const [XLSX, data] = await Promise.all([
        import('xlsx'),
        fetchRows ? fetchRows() : Promise.resolve(rows ?? []),
      ]);
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const today = new Date().toISOString().split('T')[0];
      const baseName = fileName.replace(/\.xlsx$/i, '');
      XLSX.writeFile(wb, `${baseName}_${today}.xlsx`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      {loading ? 'Gerando…' : 'Exportar XLSX'}
    </button>
  );
}
