'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/costs';
import { baseBadgeClass } from '@/components/base-filter';
import { baseLabelFromOrgao } from '@/components/base-labels';
type ComposicaoRow = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  base_id: string | null;
  orgao: string | null;
  tipo_base: string | null;
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
            <th className="px-4 py-3 text-left font-medium text-gray-600">Base</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Custo unitário</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {initialComposicoes.map((c) => (
            <tr
              key={c.id}
              className="cursor-pointer hover:bg-blue-50 hover:shadow-[inset_3px_0_0_0_#3b82f6] transition-all"
            >
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
              <td className="px-3 py-1.5 w-24">
                <Link href={`/composicoes/${c.id}`} className="block w-full h-full">
                  {c.orgao ? (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${baseBadgeClass(c.tipo_base)}`}
                    >
                      {c.tipo_base === 'externa' && (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                      {baseLabelFromOrgao(c.orgao)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
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
              <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                Nenhuma composição encontrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
