import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { OrcamentosGrid } from '../orcamentos/orcamentos-list';
import { SearchInput } from '@/components/search-input';
import { Suspense } from 'react';

type OrcRow = {
  id: string;
  nome_obra: string;
  cliente: string | null;
  data: string;
  bdi_global: number;
  codigo: string;
  tabela_itens_orcamento: { id: string }[];
  ultimo_acesso: string | null;
};
export default  async function DashboardPage({searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const sb = (await createClient()) as any;
  let orcQuery = sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, cliente, data, bdi_global, tabela_itens_orcamento(id), codigo, ultimo_acesso')
    .order('ultimo_acesso', { ascending: false, nullsFirst: false })
    .limit(10);

  if (q) {
    orcQuery = orcQuery.or(`nome_obra.ilike.%${q}%,cliente.ilike.%${q}%`);
  }
  const [rawOrc, rawTot] = await Promise.all([
    orcQuery,
    sb.from('vw_total_orcamento').select('orcamento_id, total_com_bdi'),
  ]);
  const orcamentos = (rawOrc?.data ?? []) as OrcRow[];
  const totaisMap = Object.fromEntries(
    ((rawTot?.data ?? []) as { orcamento_id: string; total_com_bdi: number }[])
      .map((t) => [t.orcamento_id, t.total_com_bdi])
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Início</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bem-vindo(a), o que deseja fazer?
        </p>
      </div> 

      {/*<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        cards.map((card) => (
          <div key={card.href} className="rounded-xl border bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{card.label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{card.count}</p>
            <Link
              href={card.href}
              className="mt-4 inline-block text-sm text-blue-600 hover:underline"
            >
              {card.action} →
            </Link>
          </div>
        ))
      </div>*/}

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-900">Ações rápidas</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/orcamentos/novo"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Cadastrar Novo Orçamento  
          </Link>
          <Link
            href="/composicoes/nova"
            className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Nova composição
          </Link>
          <Link
            href="/insumos/novo"
            className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Novo insumo
          </Link>
        </div>
      </div>
        <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Acessados recentemente</h2>
          <Link href="/orcamentos" className="text-sm text-blue-600 hover:underline">
            Ver todos →
          </Link>
        </div>
        <Suspense>
          <SearchInput placeholder="Buscar por obra ou cliente..." />
        </Suspense>
        <OrcamentosGrid initialOrcamentos={orcamentos} totaisMap={totaisMap} />
      </div>
      
    </div>
  );
}
