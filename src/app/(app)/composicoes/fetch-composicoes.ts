import { createClient } from '@/lib/supabase/server';
import { getFavoritoIds } from '@/lib/favoritos';
import { baseLabelFromOrgao } from '@/components/base-labels';
import { COMPOSICOES_PAGE_SIZE, type BaseRow, type ComposicaoView, type ComposicoesFilters, type ComposicoesPageData } from './types';

/**
 * Lógica de busca de /composicoes, extraída de page.tsx para ser
 * reaproveitada tanto no carregamento inicial (Server Component) quanto nas
 * buscas seguintes via Server Action (ver search-action.ts) — sem depender
 * de router.replace()/refresh() (ver use-reliable-replace.ts e a conversa
 * de 2026-08-24). Tipos e constantes ficam em ./types (sem imports
 * server-only) para o client component (composicoes-explorer.tsx) poder
 * importá-los sem puxar next/headers pro bundle do browser.
 */
export async function fetchComposicoesPage(filters: ComposicoesFilters, page: number): Promise<ComposicoesPageData> {
  const from = (page - 1) * COMPOSICOES_PAGE_SIZE;
  const to = from + COMPOSICOES_PAGE_SIZE - 1;

  const supabase = await createClient();
  const sb = supabase as any;

  const { data: basesRaw } = await sb
    .from('tabela_bases')
    .select('id, nome, orgao, tipo_base')
    .order('tipo_base')
    .order('orgao');
  const bases = (basesRaw ?? []) as BaseRow[];

  let baseIdFiltro: string | null = null;
  if (filters.orgao && filters.orgao !== 'SEM_BASE') {
    const match = bases.find((b) => b.orgao === filters.orgao);
    if (match) baseIdFiltro = match.id;
  }

  const favoritoIds = filters.favoritos ? await getFavoritoIds('composicao') : null;
  const semFavoritos = filters.favoritos && (favoritoIds?.length ?? 0) === 0;

  function addFilters(query: any) {
    if (filters.q) query = query.or(`codigo.ilike.%${filters.q}%,descricao.ilike.%${filters.q}%`);
    if (filters.orgao === 'SEM_BASE') query = query.is('base_id', null);
    else if (baseIdFiltro) query = query.eq('base_id', baseIdFiltro);
    if (filters.origem) query = query.eq('base_origem', filters.origem);
    if (favoritoIds) query = query.in('id', favoritoIds);
    if (filters.incompletas) query = query.eq('incompleta', true);
    return query;
  }

  const [countResult, semBaseResult, { data: composicoes, error }] = semFavoritos
    ? [{ count: 0 }, { count: 0 }, { data: [], error: null }]
    : await Promise.all([
        addFilters(sb.from('vw_custo_composicao').select('id', { count: 'exact' }).range(0, 0)),
        addFilters(sb.from('vw_custo_composicao').select('id', { count: 'exact' }).is('base_id', null).range(0, 0)),
        addFilters(
          sb.from('vw_custo_composicao')
            .select('id, codigo, descricao, unidade, base_id, orgao, tipo_base, custo_unitario, base_origem, is_favorito, incompleta')
            .order('is_favorito', { ascending: false })
            .order('codigo')
            .range(from, to)
        ),
      ]);
  if (error) throw error;
  const total: number = countResult.count ?? 0;
  const semBase: number = semBaseResult.count ?? 0;

  const composicoesPagina = (composicoes ?? []) as ComposicaoView[];

  const baseOptions = bases.map((b) => ({
    orgao: b.orgao,
    label: b.tipo_base === 'propria' ? 'Minha Base' : baseLabelFromOrgao(b.orgao),
  }));

  const basesPropias = bases.filter((b) => b.tipo_base === 'propria').length;
  const custoMedioPagina = composicoesPagina.length > 0
    ? composicoesPagina.reduce((acc, c) => acc + (c.custo_unitario ?? 0), 0) / composicoesPagina.length
    : 0;

  return { composicoes: composicoesPagina, total, semBase, bases, baseOptions, basesPropias, custoMedioPagina };
}
