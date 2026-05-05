import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SearchInput } from '@/components/search-input';
import { OrcamentosGrid } from './orcamentos-list';
import { Timestamp } from 'next/dist/server/lib/cache-handlers/types';

type OrcRow = {
  id: string;
  nome_obra: string;
  cliente: string | null;
  data: string;
  bdi_global: number;
  codigo: string;
  ultimo_acesso: string | null;
  tabela_itens_orcamento: { id: string }[];
};

export default async function OrcamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const sb = (await createClient()) as any;

  let orcQuery = sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, cliente, data, bdi_global, tabela_itens_orcamento(id), codigo, ultimo_acesso')
    .order('created_at', { ascending: false });

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orçamentos</h1>
          <p className="mt-1 text-sm text-gray-500">{orcamentos.length} orçamento(s)</p>
        </div>
        <Link
          href="/orcamentos/novo"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Novo orçamento
        </Link>
      </div>

      <Suspense>
        <SearchInput placeholder="Buscar por obra ou cliente..." />
      </Suspense>

      <OrcamentosGrid initialOrcamentos={orcamentos} totaisMap={totaisMap} />
    </div>
  );
}
