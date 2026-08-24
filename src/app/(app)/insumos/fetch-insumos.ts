import { createClient } from '@/lib/supabase/server';
import { getFavoritoIds } from '@/lib/favoritos';
import { baseLabelFromOrgao } from '@/components/base-labels';
import type { InsumoComBase } from '@/lib/supabase/types';
import { INSUMOS_PAGE_SIZE, type BaseRow, type InsumosFilters, type InsumosPageData } from './types';

/**
 * Lógica de busca de /insumos, extraída de page.tsx para ser reaproveitada
 * tanto no carregamento inicial (Server Component) quanto nas buscas
 * seguintes via Server Action (ver search-action.ts) — sem depender de
 * router.replace()/refresh(), que intermitentemente falhavam em produção
 * (ver use-reliable-replace.ts e a conversa de 2026-08-24). Tipos e
 * constantes ficam em ./types (sem imports server-only) para que o client
 * component (insumos-explorer.tsx) possa importá-los sem puxar
 * next/headers pro bundle do browser.
 */
export async function fetchInsumosPage(filters: InsumosFilters, page: number): Promise<InsumosPageData> {
  const from = (page - 1) * INSUMOS_PAGE_SIZE;
  const to = from + INSUMOS_PAGE_SIZE - 1;

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

  const favoritoIds = filters.favoritos ? await getFavoritoIds('insumo') : null;
  const semFavoritos = filters.favoritos && (favoritoIds?.length ?? 0) === 0;

  function addFilters(query: any) {
    if (filters.q) query = query.or(`codigo.ilike.%${filters.q}%,descricao.ilike.%${filters.q}%`);
    if (filters.orgao === 'SEM_BASE') query = query.is('base_id', null);
    else if (baseIdFiltro) query = query.eq('base_id', baseIdFiltro);
    if (filters.origem) query = query.eq('base_origem', filters.origem);
    if (favoritoIds) query = query.in('id', favoritoIds);
    if (filters.semPreco) query = query.or('preco_base.is.null,preco_base.eq.0');
    return query;
  }

  const [countResult, semBaseResult, { data: insumos, error }] = semFavoritos
    ? [{ count: 0 }, { count: 0 }, { data: [], error: null }]
    : await Promise.all([
        addFilters(sb.from('tabela_insumos').select('id', { count: 'exact' }).range(0, 0)),
        addFilters(sb.from('tabela_insumos').select('id', { count: 'exact' }).is('base_id', null).range(0, 0)),
        addFilters(
          sb.from('tabela_insumos')
            .select('id, codigo, descricao, grupo, unidade, preco_base, data_referencia, base_id, base_origem, tabela_bases(orgao, tipo_base), is_favorito')
            .order('is_favorito', { ascending: false })
            .order('codigo')
            .range(from, to)
        ),
      ]);
  if (error) throw error;
  const total: number = countResult.count ?? 0;
  const semBase: number = semBaseResult.count ?? 0;

  const baseOptions = bases.map((b) => ({
    orgao: b.orgao,
    label: b.tipo_base === 'propria' ? 'Minha Base' : baseLabelFromOrgao(b.orgao),
  }));

  const insumosPagina = (insumos ?? []) as InsumoComBase[];
  const custoMedio = insumosPagina.length > 0
    ? insumosPagina.reduce((acc, ins) => acc + (ins.preco_base ?? 0), 0) / insumosPagina.length
    : 0;
  const basesPropias = bases.filter((b) => b.tipo_base === 'propria').length;

  return { insumos: insumosPagina, total, semBase, bases, baseOptions, basesPropias, custoMedio };
}
