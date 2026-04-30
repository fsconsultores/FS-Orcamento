'use client';

import Link from 'next/link';
import { formatCurrency } from '@/lib/costs';
import type { Insumo } from '@/lib/supabase/types';

export function InsumosTable({ initialInsumos }: { initialInsumos: Insumo[] }) {
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
            <th className="px-4 py-3 text-left font-medium text-gray-600">Data ref.</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {initialInsumos.map((ins) => (
            <tr key={ins.id} className="cursor-pointer hover:bg-blue-50 hover:shadow-[inset_3px_0_0_0_#3b82f6] transition-all">
              <td className="px-3 py-1.5 w-24">
                <Link href={`/insumos/${ins.id}/editar`} className="block w-full h-full font-mono text-xs text-gray-600">
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
                <Link href={`/insumos/${ins.id}/editar`} className="block w-full h-full font-medium text-gray-900">
                  {formatCurrency(ins.preco_base)}
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
          ))}
          {initialInsumos.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                Nenhum insumo encontrado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
