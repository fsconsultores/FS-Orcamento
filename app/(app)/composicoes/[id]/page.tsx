import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { calcularCustoComposicao, formatCurrency, formatNumber } from '@/lib/costs';

export default async function ComposicaoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: composicao, error } = await supabase
    .from('tabela_composicoes')
    .select(`
      *,
      tabela_itens_composicao (
        id,
        indice,
        tabela_insumos ( id, codigo, descricao, unidade, preco_base )
      )
    `)
    .eq('id', id)
    .single();

  if (error || !composicao) notFound();

  type ItemDetalhe = {
    id: string;
    indice: number;
    tabela_insumos: {
      id: string;
      codigo: string;
      descricao: string;
      unidade: string;
      preco_base: number;
    } | null;
  };

  const itens = (composicao.tabela_itens_composicao ?? []) as ItemDetalhe[];
  const custoUnitario = calcularCustoComposicao(
    itens
      .filter((i) => i.tabela_insumos)
      .map((i) => ({ indice: i.indice, insumo: i.tabela_insumos! }))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/composicoes" className="text-sm text-blue-600 hover:underline">
            ← Composições
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{composicao.descricao}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {composicao.codigo} · {composicao.unidade}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Custo unitário</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(custoUnitario)}</p>
          <p className="text-xs text-gray-400">/{composicao.unidade}</p>
        </div>
      </div>

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
            {itens.map((item) => {
              if (!item.tabela_insumos) return null;
              const sub = item.indice * item.tabela_insumos.preco_base;
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    {item.tabela_insumos.codigo}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{item.tabela_insumos.descricao}</td>
                  <td className="px-4 py-3 text-gray-600">{item.tabela_insumos.unidade}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatNumber(item.indice)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatCurrency(item.tabela_insumos.preco_base)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatCurrency(sub)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t bg-gray-50">
            <tr>
              <td colSpan={5} className="px-4 py-3 text-right font-semibold text-gray-700">
                Total
              </td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">
                {formatCurrency(custoUnitario)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
