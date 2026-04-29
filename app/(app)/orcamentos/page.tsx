import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatCurrency } from '@/lib/costs';

export default async function OrcamentosPage() {
  const supabase = await createClient();
  const { data: orcamentos, error } = await supabase
    .from('tabela_orcamentos')
    .select(`
      *,
      tabela_itens_orcamento (
        quantidade,
        bdi_especifico,
        tabela_composicoes (
          tabela_itens_composicao (
            indice,
            tabela_insumos ( preco_base )
          )
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  function calcularTotal(orcamento: typeof orcamentos[0]) {
    let total = 0;
    for (const item of orcamento.tabela_itens_orcamento ?? []) {
      const itensComp = (item.tabela_composicoes as any)?.tabela_itens_composicao ?? [];
      const custoUnit = itensComp.reduce(
        (acc: number, ic: { indice: number; tabela_insumos: { preco_base: number } | null }) =>
          acc + ic.indice * (ic.tabela_insumos?.preco_base ?? 0),
        0
      );
      const bdi = item.bdi_especifico ?? orcamento.bdi_global;
      total += item.quantidade * custoUnit * (1 + bdi / 100);
    }
    return total;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orçamentos</h1>
          <p className="mt-1 text-sm text-gray-500">{orcamentos?.length ?? 0} orçamento(s)</p>
        </div>
        <Link
          href="/orcamentos/novo"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Novo orçamento
        </Link>
      </div>

      {orcamentos?.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
          <p className="text-gray-400">Nenhum orçamento criado.</p>
          <Link href="/orcamentos/novo" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Criar primeiro orçamento →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orcamentos?.map((orc) => {
            const total = calcularTotal(orc);
            const qtdItens = orc.tabela_itens_orcamento?.length ?? 0;
            return (
              <Link
                key={orc.id}
                href={`/orcamentos/${orc.id}`}
                className="block rounded-xl border bg-white p-5 shadow-sm hover:border-blue-200 hover:shadow-md transition-all"
              >
                <p className="font-semibold text-gray-900 truncate">{orc.nome_obra}</p>
                {orc.cliente && (
                  <p className="mt-0.5 text-sm text-gray-500 truncate">{orc.cliente}</p>
                )}
                <p className="mt-3 text-xl font-bold text-gray-900">{formatCurrency(total)}</p>
                <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>{qtdItens} item(ns)</span>
                  <span>BDI {orc.bdi_global}%</span>
                  <span>{new Date(orc.data).toLocaleDateString('pt-BR')}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
