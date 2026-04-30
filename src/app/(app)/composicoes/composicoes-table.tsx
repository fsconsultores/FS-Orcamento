'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/costs';

type ComposicaoRow = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  custo_unitario: number;
};

export function ComposicoesTable({ initialComposicoes }: { initialComposicoes: ComposicaoRow[] }) {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Descrição</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Unidade</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Custo unitário</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {initialComposicoes.map((c) => (
            <tr key={c.id} className="cursor-pointer hover:bg-blue-50 hover:shadow-[inset_3px_0_0_0_#3b82f6] transition-all">
              <td className="px-3 py-1.5 w-28">
                <Link href={`/composicoes/${c.id}`} className="block w-full h-full font-mono text-xs text-gray-600">
                  {c.codigo}
                </Link>
              </td>
              <td className="px-3 py-1.5">
                <Link href={`/composicoes/${c.id}`} className="block w-full h-full text-gray-900">
                  {c.descricao}
                </Link>
              </td>
              <td className="px-3 py-1.5 w-20">
                <Link href={`/composicoes/${c.id}`} className="block w-full h-full text-gray-600">
                  {c.unidade}
                </Link>
              </td>
              <td className="px-3 py-1.5 text-right font-medium text-gray-900 w-32">
                <Link href={`/composicoes/${c.id}`} className="block w-full h-full">
                  {formatCurrency(c.custo_unitario)}
                </Link>
              </td>
            </tr>
          ))}
          {initialComposicoes.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                Nenhuma composição encontrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
