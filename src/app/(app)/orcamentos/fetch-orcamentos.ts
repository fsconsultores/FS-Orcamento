import { createClient } from '@/lib/supabase/server';
import { getFavoritoIds } from '@/lib/favoritos';
import type { OrcamentosData, OrcamentosFilters, OrcRow } from './types';

/**
 * Lógica de busca de /orcamentos, extraída de page.tsx para ser reaproveitada
 * tanto no carregamento inicial (Server Component) quanto nas buscas/trocas
 * de filtro seguintes via Server Action (ver search-action.ts) — sem
 * depender de router.replace()/refresh() (ver use-reliable-replace.ts e a
 * conversa de 2026-08-24 sobre o bug sistêmico do router do Next).
 */
export async function fetchOrcamentos(filters: OrcamentosFilters): Promise<OrcamentosData> {
  const { q, favoritos: favoritosAtivo, modelos: modelosAtivo, semVersao: semVersaoAtivo } = filters;
  const sb = (await createClient()) as any;

  const favoritoIds = favoritosAtivo ? await getFavoritoIds('orcamento') : null;
  const semFavoritos = favoritosAtivo && (favoritoIds?.length ?? 0) === 0;

  let orcQuery = sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, cliente, data, bdi_global, tabela_itens_orcamento(id), codigo, ultimo_acesso, created_at, is_favorito, is_modelo, user_id')
    .eq('is_modelo', modelosAtivo)
    .order('is_favorito', { ascending: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false });

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

  return { orcamentos, totaisMap };
}
