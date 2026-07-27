import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SearchInput } from '@/components/search-input';
import { FavoritosFilterToggle } from '@/components/favoritos-filter-toggle';
import { FilterBanner } from '@/components/ui/filter-banner';
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
  user_id: string;
};

export default async function OrcamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; favoritos?: string; semVersao?: string }>;
}) {
  const { q, favoritos, semVersao } = await searchParams;
  const favoritosAtivo = favoritos === '1';
  const semVersaoAtivo = semVersao === '1';
  const sb = (await createClient()) as any;

  const favoritoIds = favoritosAtivo ? await getFavoritoIds('orcamento') : null;
  const semFavoritos = favoritosAtivo && (favoritoIds?.length ?? 0) === 0;

  // Orçamentos agora são visíveis e editáveis por todo o domínio (RLS
  // relaxada em 20260724000000_orcamentos_visiveis_dominio.sql). Ainda
  // precisamos do usuário atual só pra marcar o dono ao duplicar um
  // orçamento (linha otimista em orcamentos-list.tsx).
  const { data: { user: currentUser } } = await sb.auth.getUser();

  let orcQuery = sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, cliente, data, bdi_global, tabela_itens_orcamento(id), codigo, ultimo_acesso, created_at, is_favorito, user_id')
    .order('is_favorito', { ascending: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false });

  // Um único filtro cobre nome_obra, cliente e codigo ao mesmo tempo
  if (q) {
    orcQuery = orcQuery.or(`nome_obra.ilike.%${q}%,cliente.ilike.%${q}%,codigo.ilike.%${q}%`);
  }
  if (favoritoIds) orcQuery = orcQuery.in('id', favoritoIds);

  const [rawOrc, rawTot, rawVersoes] = semFavoritos
    ? [{ data: [] }, { data: [] }, { data: [] }]
    : await Promise.all([
        orcQuery,
        sb.from('vw_total_orcamento').select('orcamento_id, total_com_bdi'),
        semVersaoAtivo ? sb.from('orcamento_versoes').select('orcamento_id') : Promise.resolve({ data: [] }),
      ]);

  const idsComVersao = new Set(
    ((rawVersoes?.data ?? []) as { orcamento_id: string }[]).map((v) => v.orcamento_id)
  );
  const orcamentos = (
    semVersaoAtivo
      ? ((rawOrc?.data ?? []) as OrcRow[]).filter((o) => !idsComVersao.has(o.id))
      : (rawOrc?.data ?? [])
  ) as OrcRow[];
  const totaisMap = Object.fromEntries(
    ((rawTot?.data ?? []) as { orcamento_id: string; total_com_bdi: number }[])
      .map((t) => [t.orcamento_id, t.total_com_bdi])
  );

  const clearSemVersaoHref = (() => {
    const p = new URLSearchParams()
    if (q) p.set('q', q)
    if (favoritosAtivo) p.set('favoritos', '1')
    return `/orcamentos${p.toString() ? '?' + p.toString() : ''}`
  })()

  return (
    <div className="space-y-6">
      {semVersaoAtivo && (
        <FilterBanner
          label={`Mostrando ${orcamentos.length.toLocaleString('pt-BR')} ${orcamentos.length === 1 ? 'orçamento sem versão salva' : 'orçamentos sem versão salva'}`}
          clearHref={clearSemVersaoHref}
        />
      )}
      <OrcamentosGrid initialOrcamentos={orcamentos} totaisMap={totaisMap} favoritosAtivo={favoritosAtivo} currentUserId={currentUser?.id ?? null}>
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
