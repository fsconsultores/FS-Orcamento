'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatNumber } from '@/lib/costs';
import { EditableCell } from '@/components/editable-cell';

type InsumoDetalhe = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  preco_base: number;
};

type ItemRow = {
  id: string;
  indice: number;
  insumo: InsumoDetalhe;
};

export function ItensTable({ initialItens }: { initialItens: ItemRow[] }) {
  const router = useRouter();
  const [itens, setItens] = useState(initialItens);

  useEffect(() => {
    setItens(initialItens);
  }, [initialItens]);

  const custoTotal = itens.reduce((sum, item) => sum + item.indice * item.insumo.preco_base, 0);

  async function saveIndice(itemId: string, raw: string): Promise<void> {
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) throw new Error('Índice deve ser maior que zero');
    console.log('[itens_composicao] update indice', { itemId, n });
    const sb = createClient() as any;
    const { data, error } = await sb
      .from('tabela_itens_composicao')
      .update({ indice: n })
      .eq('id', itemId)
      .select('id');
    if (error) {
      console.error('[itens_composicao] update error', error);
      throw error;
    }
    if (!data?.length) {
      console.error('[itens_composicao] update bloqueado por RLS — 0 linhas', { itemId });
      throw new Error('Sem permissão — aplique a migration de políticas RLS no Supabase.');
    }
    console.log('[itens_composicao] update ok', { itemId, n });
    setItens(prev => prev.map(item => item.id === itemId ? { ...item, indice: n } : item));
    router.refresh();
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-gray-900">Composição de custos</h2>
      </div>
      <table className="w-full text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Insumo</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Unidade</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Índice</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Preço base</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Subtotal</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {itens.map((item) => (
            <tr key={item.id} className="hover:bg-gray-50/30">
              <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.insumo.codigo}</td>
              <td className="px-4 py-3 text-gray-900">{item.insumo.descricao}</td>
              <td className="px-4 py-3 text-gray-600">{item.insumo.unidade}</td>
              <td className="px-4 py-2 w-32">
                <EditableCell
                  value={String(item.indice)}
                  display={formatNumber(item.indice)}
                  type="number"
                  align="right"
                  min="0.000001"
                  step="any"
                  onSave={(v) => saveIndice(item.id, v)}
                  className="text-gray-700"
                />
              </td>
              <td className="px-4 py-3 text-right text-gray-700">
                {formatCurrency(item.insumo.preco_base)}
              </td>
              <td className="px-4 py-3 text-right font-medium text-gray-900">
                {formatCurrency(item.indice * item.insumo.preco_base)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t bg-gray-50">
          <tr>
            <td colSpan={5} className="px-4 py-3 text-right font-semibold text-gray-700">
              Total
            </td>
            <td className="px-4 py-3 text-right font-bold text-gray-900">
              {formatCurrency(custoTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
