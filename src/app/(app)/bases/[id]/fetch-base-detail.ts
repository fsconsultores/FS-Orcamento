import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BASE_DETAIL_PAGE_SIZE, type BaseDetailData, type BaseDetailFilters } from './types';

/**
 * Lógica de busca de /bases/[id], extraída de page.tsx para ser reaproveitada
 * tanto no carregamento inicial (Server Component) quanto nas buscas/trocas
 * de aba seguintes via Server Action (ver search-action.ts) — sem depender
 * de navegação client-side (router.replace/<Link>), que nesta tela já tinha
 * sido trocada por `<a>` nativo (reload cheio) por causa do mesmo bug
 * sistêmico do router do Next (ver base-tabs.tsx antigo). Agora nem isso é
 * necessário: a busca e a troca de aba viram uma chamada de Server Action.
 */
export async function fetchBaseDetail(id: string, filters: BaseDetailFilters, page: number): Promise<BaseDetailData> {
  const from = (page - 1) * BASE_DETAIL_PAGE_SIZE;
  const to = from + BASE_DETAIL_PAGE_SIZE - 1;
  const { tab, q } = filters;

  const supabase = await createClient();
  const sb = supabase as any;

  let tabQuery = tab === 'insumos'
    ? sb.from('tabela_insumos').select('id, codigo, descricao, unidade, grupo, preco_base, data_referencia', q ? { count: 'exact' } : undefined).eq('base_id', id)
    : sb.from('vw_custo_composicao').select('id, codigo, descricao, unidade, custo_unitario, incompleta', q ? { count: 'exact' } : undefined).eq('base_id', id);
  if (q) tabQuery = tabQuery.or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`);
  tabQuery = tabQuery.order('codigo').range(from, to);

  const [{ data: base }, { count: totalInsumos }, { count: totalComposicoes }, { data: tabData, count: totalBusca, error }] = await Promise.all([
    sb.from('tabela_bases').select('id, nome, orgao, tipo_base').eq('id', id).single(),
    sb.from('tabela_insumos').select('id', { count: 'exact', head: true }).eq('base_id', id),
    sb.from('vw_custo_composicao').select('id', { count: 'exact', head: true }).eq('base_id', id),
    tabQuery,
  ]);
  if (!base) notFound();
  if (error) throw error;

  const total = q ? (totalBusca ?? 0) : (tab === 'insumos' ? (totalInsumos ?? 0) : (totalComposicoes ?? 0));

  return {
    base,
    totalInsumos: totalInsumos ?? 0,
    totalComposicoes: totalComposicoes ?? 0,
    total,
    insumos: tab === 'insumos' ? (tabData ?? []) : [],
    composicoes: tab === 'composicoes' ? (tabData ?? []) : [],
  };
}
