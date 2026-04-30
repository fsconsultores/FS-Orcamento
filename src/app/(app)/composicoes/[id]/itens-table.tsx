'use client';

import { formatCurrency, formatNumber } from '@/lib/costs';

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
  const custoTotal = initialItens.reduce((sum, item) => sum + item.indice * item.insumo.preco_base, 0);

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
          {initialItens.map((item) => (
            <tr key={item.id} className="hover:bg-blue-50 hover:shadow-[inset_3px_0_0_0_#3b82f6] transition-all">
              <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.insumo.codigo}</td>
              <td className="px-4 py-3 text-gray-900">{item.insumo.descricao}</td>
              <td className="px-4 py-3 text-gray-600">{item.insumo.unidade}</td>
              <td className="px-4 py-3 w-32 text-right text-gray-700">{formatNumber(item.indice)}</td>
              <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.insumo.preco_base)}</td>
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
