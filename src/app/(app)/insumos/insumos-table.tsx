'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/costs';
import { baseBadgeClass } from '@/components/base-filter';
import { baseLabelFromOrgao } from '@/components/base-labels';
import type { InsumoComBase } from '@/lib/supabase/types';

export function InsumosTable({ initialInsumos }: { initialInsumos: InsumoComBase[] }) {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Descrição</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Grupo</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Unidade</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Custo</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Base</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Data ref.</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {initialInsumos.map((ins) => {
            const isExterna = ins.tabela_bases?.tipo_base === 'externa';
            const rowClass = isExterna
              ? 'hover:bg-gray-50 transition-all'
              : 'cursor-pointer hover:bg-blue-50 hover:shadow-[inset_3px_0_0_0_#3b82f6] transition-all';

            return (
              <tr key={ins.id} className={rowClass}>
                <td className="px-3 py-1.5 w-24">
                  <Link
                    href={`/insumos/${ins.id}/editar`}
                    className="block w-full h-full font-mono text-xs text-gray-600"
                  >
                    {ins.codigo}
                  </Link>
                </td>
                <td className="px-3 py-1.5">
                  <Link href={`/insumos/${ins.id}/editar`} className="block w-full h-full text-gray-900">
                    {ins.descricao}
                  </Link>
                </td>
                <td className="px-3 py-1.5 w-36">
                  <Link href={`/insumos/${ins.id}/editar`} className="block w-full h-full text-gray-600">
                    {ins.grupo ?? '—'}
                  </Link>
                </td>
                <td className="px-3 py-1.5 w-20">
                  <Link href={`/insumos/${ins.id}/editar`} className="block w-full h-full text-gray-600">
                    {ins.unidade}
                  </Link>
                </td>
                <td className="px-3 py-1.5 w-32 text-right">
                  <Link
                    href={`/insumos/${ins.id}/editar`}
                    className="block w-full h-full font-medium text-gray-900"
                  >
                    {formatCurrency(ins.preco_base)}
                  </Link>
                </td>
                <td className="px-3 py-1.5 w-32">
                  <Link href={`/insumos/${ins.id}/editar`} className="block w-full h-full">
                    {ins.base_origem && ins.tabela_bases?.tipo_base === 'propria' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border bg-blue-50 text-blue-700 border-blue-200">
                        {ins.base_origem}
                      </span>
                    ) : ins.tabela_bases ? (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${baseBadgeClass(ins.tabela_bases.tipo_base)}`}
                      >
                        {ins.tabela_bases.tipo_base === 'externa' && (
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}
                        {baseLabelFromOrgao(ins.tabela_bases.orgao)}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </Link>
                </td>
                <td className="px-3 py-1.5 w-28">
                  <Link href={`/insumos/${ins.id}/editar`} className="block w-full h-full text-gray-500">
                    {ins.data_referencia
                      ? new Date(ins.data_referencia).toLocaleDateString('pt-BR')
                      : '—'}
                  </Link>
                </td>
              </tr>
            );
          })}
          {initialInsumos.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                Nenhum insumo encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
