import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { calcularCustoComposicao, formatCurrency } from '@/lib/costs';
import { ItensTable } from './itens-table';

export default async function ComposicaoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = (await createClient()) as any;

  const { data: composicao, error } = await sb
    .from('tabela_composicoes')
    .select(`*, tabela_itens_composicao(id, indice, tabela_insumos(id, codigo, descricao, unidade, preco_base))`)
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

  type ComposicaoDetalhe = {
    id: string;
    codigo: string;
    descricao: string;
    unidade: string;
    tabela_itens_composicao: ItemDetalhe[];
  };

  const comp = composicao as ComposicaoDetalhe;
  const itens = comp.tabela_itens_composicao ?? [];

  const custoUnitario = calcularCustoComposicao(
    itens
      .filter((i) => i.tabela_insumos)
      .map((i) => ({ indice: i.indice, insumo: i.tabela_insumos! }))
  );

  const itensParaTabela = itens
    .filter((i) => i.tabela_insumos !== null)
    .map((i) => ({ id: i.id, indice: i.indice, insumo: i.tabela_insumos! }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/composicoes" className="text-sm text-blue-600 hover:underline">
            ← Composições
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{comp.descricao}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {comp.codigo} · {comp.unidade}
          </p>
        </div>
        <div className="flex items-start gap-4">
          <div className="text-right">
            <p className="text-sm text-gray-500">Custo unitário</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(custoUnitario)}</p>
            <p className="text-xs text-gray-400">/{comp.unidade}</p>
          </div>
          <Link
            href={`/composicoes/${id}/editar`}
            className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Editar
          </Link>
        </div>
      </div>

      <ItensTable initialItens={itensParaTabela} />
    </div>
  );
}
