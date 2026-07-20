import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SearchInput } from '@/components/search-input';
import { FavoritosFilterToggle } from '@/components/favoritos-filter-toggle';
import { getFavoritoIds } from '@/lib/favoritos';
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
  is_favorito?: boolean;
};

export default async function OrcamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; favoritos?: string }>;
}) {
  const { q, favoritos } = await searchParams;
  const favoritosAtivo = favoritos === '1';
  const sb = (await createClient()) as any;

  const favoritoIds = favoritosAtivo ? await getFavoritoIds('orcamento') : null;
  const semFavoritos = favoritosAtivo && (favoritoIds?.length ?? 0) === 0;

  let orcQuery = sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, cliente, data, bdi_global, tabela_itens_orcamento(id), codigo, ultimo_acesso, created_at, is_favorito')
    .order('is_favorito', { ascending: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false });

  // Um único filtro cobre nome_obra, cliente e codigo ao mesmo tempo
  if (q) {
    orcQuery = orcQuery.or(`nome_obra.ilike.%${q}%,cliente.ilike.%${q}%,codigo.ilike.%${q}%`);
  }
  if (favoritoIds) orcQuery = orcQuery.in('id', favoritoIds);

  const [rawOrc, rawTot] = semFavoritos
    ? [{ data: [] }, { data: [] }]
    : await Promise.all([
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
      <OrcamentosGrid initialOrcamentos={orcamentos} totaisMap={totaisMap} favoritosAtivo={favoritosAtivo}>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="sm:max-w-xs sm:flex-1">
            <Suspense>
              <SearchInput placeholder="Buscar por obra, cliente ou código..." debounce={300} />
            </Suspense>
          </div>
          <Suspense>
            <FavoritosFilterToggle />
          </Suspense>
        </div>
      </OrcamentosGrid>
    </div>
  );
}
