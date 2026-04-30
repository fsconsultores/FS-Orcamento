'use client';

import Link from 'next/link';

type OrcRow = {
  id: string;
  nome_obra: string;
  cliente: string | null;
  data: string;
  bdi_global: number;
  codigo: string;
  tabela_itens_orcamento: { id: string }[];
};

interface Props {
  initialOrcamentos: OrcRow[];
  totaisMap: Record<string, number>;
}

export function OrcamentosGrid({ initialOrcamentos }: Props) {
  if (initialOrcamentos.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
        <p className="text-gray-400">Nenhum orçamento criado.</p>
        <Link href="/orcamentos/novo" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Criar primeiro orçamento →
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <th className="px-4 py-3">Código</th>
            <th className="px-4 py-3">Nome da Obra</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3 text-center">BDI</th>
            <th className="px-4 py-3 text-center">Itens</th>
            <th className="px-4 py-3">Data de Inclusão</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {initialOrcamentos.map((orc) => (
            <tr key={orc.id} className="cursor-pointer hover:bg-blue-50 hover:shadow-[inset_3px_0_0_0_#3b82f6] transition-all">
              <td className="px-4 py-3 font-mono text-xs text-gray-500">
                <Link href={`/orcamentos/${orc.id}`} className="block w-full h-full">
                  {orc.codigo}
                </Link>
              </td>
              <td className="px-4 py-3 font-medium text-gray-900">
                <Link href={`/orcamentos/${orc.id}`} className="block w-full h-full">
                  {orc.nome_obra}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-600">
                <Link href={`/orcamentos/${orc.id}`} className="block w-full h-full">
                  {orc.cliente ?? '—'}
                </Link>
              </td>
              <td className="px-4 py-3 text-center text-gray-700">
                <Link href={`/orcamentos/${orc.id}`} className="block w-full h-full">
                  {orc.bdi_global}%
                </Link>
              </td>
              <td className="px-4 py-3 text-center text-gray-600">
                <Link href={`/orcamentos/${orc.id}`} className="block w-full h-full">
                  {orc.tabela_itens_orcamento.length}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-500">
                <Link href={`/orcamentos/${orc.id}`} className="block w-full h-full">
                  {new Date(orc.data).toLocaleDateString('pt-BR')}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
