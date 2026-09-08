import { createClient } from '@/lib/supabase/server';
import { fetchAllPaginatedParallel } from '@/lib/orcamento/paginate';
import { classificarCategoriaAbc } from '@/lib/curva-abc';
import { contarUsoEmOrcamentos } from '@/lib/biblioteca/uso-orcamentos';
import { BIBLIOTECA_PAGE_SIZE, type BibliotecaData, type BibliotecaFilters, type BibliotecaInsumoRow } from './types';

/**
 * Lógica de busca de /biblioteca — mesma forma de fetch-base-detail.ts, mas
 * paralela (não a mesma função): não mexe em BaseDetailExplorer/fetchBaseDetail,
 * usados por TODAS as bases (inclusive SINAPI, dezenas de milhares de linhas) —
 * arriscado degradar uma rota já testada só pra acrescentar contagem
 * cross-orçamento e filtro de categoria, que só fazem sentido aqui.
 */
export async function fetchBiblioteca(filters: BibliotecaFilters, page: number): Promise<BibliotecaData> {
  const supabase = await createClient();
  const sb = supabase as any;

  const { data: baseId, error: baseErr } = await sb.rpc('get_or_create_propria_base');
  if (baseErr) throw new Error(baseErr.message);

  const [{ count: totalInsumos }, { count: totalComposicoes }] = await Promise.all([
    sb.from('tabela_insumos').select('id', { count: 'exact', head: true }).eq('base_id', baseId),
    sb.from('vw_custo_composicao').select('id', { count: 'exact', head: true }).eq('base_id', baseId),
  ]);

  const { tab, q, categoria } = filters;
  const from = (page - 1) * BIBLIOTECA_PAGE_SIZE;
  const to = from + BIBLIOTECA_PAGE_SIZE - 1;

  let insumos: BibliotecaInsumoRow[] = [];
  let composicoes: BibliotecaData['composicoes'] = [];
  let total = 0;

  if (tab === 'insumos') {
    if (categoria) {
      // Categoria é uma classificação em JS (classificarCategoriaAbc, única
      // fonte de verdade da regra — não duplicar em SQL). A base própria é
      // pequena o bastante pra buscar tudo (já com o filtro de texto
      // aplicado) e paginar em memória depois de classificar.
      let query = sb.from('tabela_insumos')
        .select('id, codigo, descricao, unidade, grupo, preco_base, data_referencia', { count: 'exact' })
        .eq('base_id', baseId);
      if (q) query = query.or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`);
      const todos = await fetchAllPaginatedParallel<Omit<BibliotecaInsumoRow, 'usadoEm'>>(
        (f, t) => query.order('codigo').range(f, t)
      );
      const filtrados = todos.filter((i) => classificarCategoriaAbc(i.grupo) === categoria);
      total = filtrados.length;
      const pagina = filtrados.slice(from, to + 1);
      const uso = await contarUsoEmOrcamentos(sb, pagina.map((i) => i.codigo));
      insumos = pagina.map((i) => ({ ...i, usadoEm: uso.get(i.codigo) ?? 0 }));
    } else {
      let query = sb.from('tabela_insumos')
        .select('id, codigo, descricao, unidade, grupo, preco_base, data_referencia', { count: 'exact' })
        .eq('base_id', baseId);
      if (q) query = query.or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`);
      const { data, count, error } = await query.order('codigo').range(from, to);
      if (error) throw new Error(error.message);
      total = count ?? 0;
      const uso = await contarUsoEmOrcamentos(sb, (data ?? []).map((i: any) => i.codigo));
      insumos = (data ?? []).map((i: any) => ({ ...i, usadoEm: uso.get(i.codigo) ?? 0 }));
    }
  } else {
    let query = sb.from('vw_custo_composicao')
      .select('id, codigo, descricao, unidade, custo_unitario, incompleta', { count: 'exact' })
      .eq('base_id', baseId);
    if (q) query = query.or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`);
    const { data, count, error } = await query.order('codigo').range(from, to);
    if (error) throw new Error(error.message);
    total = count ?? 0;
    const uso = await contarUsoEmOrcamentos(sb, (data ?? []).map((c: any) => c.codigo));
    composicoes = (data ?? []).map((c: any) => ({ ...c, usadoEm: uso.get(c.codigo) ?? 0 }));
  }

  return { totalInsumos: totalInsumos ?? 0, totalComposicoes: totalComposicoes ?? 0, total, insumos, composicoes };
}
