'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function EditarItemButton({
  itemId,
  quantidade,
  bdiEspecifico,
  bdiGlobal,
}: {
  itemId: string;
  quantidade: number;
  bdiEspecifico: number | null;
  bdiGlobal: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [qtd, setQtd] = useState(String(quantidade));
  const [bdi, setBdi] = useState(bdiEspecifico !== null ? String(bdiEspecifico) : '');

  function handleCancel() {
    setQtd(String(quantidade));
    setBdi(bdiEspecifico !== null ? String(bdiEspecifico) : '');
    setEditing(false);
  }

  async function handleSave() {
    const newQtd = parseFloat(qtd);
    if (isNaN(newQtd) || newQtd <= 0) return;
    const newBdi = bdi !== '' ? parseFloat(bdi) : null;
    if (newBdi !== null && (isNaN(newBdi) || newBdi < 0)) return;

    setLoading(true);
    const supabase = createClient();
    await supabase
      .from('tabela_itens_orcamento')
      .update({ quantidade: newQtd, bdi_especifico: newBdi })
      .eq('id', itemId);
    router.refresh();
    setEditing(false);
    setLoading(false);
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-blue-600 hover:underline"
      >
        Editar
      </button>
    );
  }

  return (
    <div className="space-y-1.5 text-left">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 w-6">Qtd</span>
        <input
          type="number"
          min="0.0001"
          step="any"
          value={qtd}
          onChange={(e) => setQtd(e.target.value)}
          className="w-20 rounded border border-gray-300 px-1.5 py-1 text-xs outline-none focus:border-blue-500"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 w-6">BDI</span>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder={String(bdiGlobal)}
          value={bdi}
          onChange={(e) => setBdi(e.target.value)}
          className="w-20 rounded border border-gray-300 px-1.5 py-1 text-xs outline-none focus:border-blue-500"
        />
      </div>
      <div className="flex gap-1 pt-0.5">
        <button
          onClick={handleSave}
          disabled={loading}
          className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '...' : 'Salvar'}
        </button>
        <button
          onClick={handleCancel}
          className="text-xs text-gray-500 hover:text-gray-700 px-1"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
