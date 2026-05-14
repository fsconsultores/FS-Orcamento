import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SearchInput } from '@/components/search-input';
import { OrcamentosGrid } from './orcamentos-list';

type OrcRow = {
  id: string;
  nome_obra: string;
  cliente: string | null;
  data: string;
  bdi_global: number;
  codigo: string;
  ultimo_acesso: string | null;
  created_at: string;
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
    .select('id, nome_obra, cliente, data, bdi_global, tabela_itens_orcamento(id), codigo, ultimo_acesso, created_at')
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false });

  // Um único filtro cobre nome_obra, cliente e codigo ao mesmo tempo
  if (q) {
    orcQuery = orcQuery.or(`nome_obra.ilike.%${q}%,cliente.ilike.%${q}%,codigo.ilike.%${q}%`);
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
      <Suspense>
        <SearchInput placeholder="Buscar por obra, cliente ou código..." debounce={300} />
      </Suspense>

      <OrcamentosGrid initialOrcamentos={orcamentos} totaisMap={totaisMap} />
    </div>
  );
}
