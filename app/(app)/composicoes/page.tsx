import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { calcularCustoComposicao, formatCurrency } from '@/lib/costs';

export default async function ComposicoesPage() {
  const supabase = await createClient();
  const { data: composicoes, error } = await supabase
    .from('tabela_composicoes')
    .select(`
      *,
      tabela_itens_composicao (
        indice,
        tabela_insumos ( preco_base )
      )
    `)
    .order('codigo');

  if (error) throw error;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Composições</h1>
          <p className="mt-1 text-sm text-gray-500">Biblioteca de serviços (somente leitura)</p>
        </div>
        <Link
          href="/composicoes/nova"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nova composição
        </Link>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Descrição</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Unidade</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Custo unitário</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Insumos</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {composicoes?.map((composicao) => {
              const itens = (composicao.tabela_itens_composicao ?? []) as {
                indice: number;
                tabela_insumos: { preco_base: number } | null;
              }[];
              const custo = calcularCustoComposicao(
                itens
                  .filter((i) => i.tabela_insumos)
                  .map((i) => ({ indice: i.indice, insumo: i.tabela_insumos! }))
              );

              return (
                <tr key={composicao.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{composicao.codigo}</td>
                  <td className="px-4 py-3 text-gray-900">{composicao.descricao}</td>
                  <td className="px-4 py-3 text-gray-600">{composicao.unidade}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatCurrency(custo)}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500">{itens.length}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/composicoes/${composicao.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              );
            })}
            {composicoes?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  Nenhuma composição cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
