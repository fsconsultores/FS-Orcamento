'use server';

import { createClient } from '@/lib/supabase/server';
import { getFavoritoIds } from '@/lib/favoritos';
import type { ComposicaoParaExport } from '@/components/export-composicoes-button';
import type { ComposicoesFilters } from './types';

/**
 * Busca sob demanda (só quando o usuário clica em "Exportar XLSX"), com o
 * join caro de insumos por composição — antes rodava em toda visita/busca
 * de /composicoes; ver ExportComposicoesButton.fetchComposicoes e o
 * comentário original em page.tsx sobre o custo desse cálculo.
 */
export async function exportComposicoesAction(filters: ComposicoesFilters): Promise<ComposicaoParaExport[]> {
  const supabase = await createClient();
  const sb = supabase as any;

  const { data: basesRaw } = await sb.from('tabela_bases').select('id, orgao');
  const bases = (basesRaw ?? []) as { id: string; orgao: string }[];

  let baseIdFiltro: string | null = null;
  if (filters.orgao && filters.orgao !== 'SEM_BASE') {
    const match = bases.find((b) => b.orgao === filters.orgao);
    if (match) baseIdFiltro = match.id;
  }

  const favoritoIds = filters.favoritos ? await getFavoritoIds('composicao') : null;
  if (filters.favoritos && (favoritoIds?.length ?? 0) === 0) return [];

  function addFilters(query: any) {
    if (filters.q) query = query.or(`codigo.ilike.%${filters.q}%,descricao.ilike.%${filters.q}%`);
    if (filters.orgao === 'SEM_BASE') query = query.is('base_id', null);
    else if (baseIdFiltro) query = query.eq('base_id', baseIdFiltro);
    if (filters.origem) query = query.eq('base_origem', filters.origem);
    if (favoritoIds) query = query.in('id', favoritoIds);
    if (filters.incompletas) query = query.eq('incompleta', true);
    return query;
  }

  const { data: composicoes, error } = await addFilters(
    sb.from('vw_custo_composicao').select('id, codigo, descricao, unidade, custo_unitario').order('codigo')
  );
  if (error) throw error;

  const compIds = (composicoes ?? []).map((c: any) => c.id as string);
  const insumosPorComp: Record<string, ComposicaoParaExport['insumos']> = {};
  if (compIds.length > 0) {
    const { data: itens } = await sb
      .from('tabela_itens_composicao')
      .select('composicao_id, indice, tabela_insumos(codigo, descricao, unidade, preco_base, grupo)')
      .in('composicao_id', compIds);
    for (const it of itens ?? []) {
      const ins = it.tabela_insumos;
      if (!ins) continue;
      if (!insumosPorComp[it.composicao_id]) insumosPorComp[it.composicao_id] = [];
      insumosPorComp[it.composicao_id]!.push({
        codigo: ins.codigo ?? '',
        descricao: ins.descricao ?? '',
        unidade: ins.unidade ?? '',
        custo: ins.preco_base ?? 0,
        indice: it.indice ?? 0,
        grupo: ins.grupo ?? null,
      });
    }
  }

  return (composicoes ?? []).map((c: any) => ({
    id: c.id,
    codigo: c.codigo,
    descricao: c.descricao,
    unidade: c.unidade,
    custo_unitario: c.custo_unitario ?? 0,
    insumos: insumosPorComp[c.id] ?? [],
  }));
}
