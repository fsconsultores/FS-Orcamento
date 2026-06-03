import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SearchInput } from '@/components/search-input';
import { BaseFilter } from '@/components/base-filter';
import { baseLabelFromOrgao } from '@/components/base-labels';
import { ComposicoesTable } from './composicoes-table';
import { ExportComposicoesButton } from '@/components/export-composicoes-button';
import type { ComposicaoParaExport } from '@/components/export-composicoes-button';
import { Pagination } from '@/components/pagination';

type ComposicaoView = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  base_id: string | null;
  orgao: string | null;
  tipo_base: string | null;
  custo_unitario: number;
  base_origem: string | null;
};

const PAGE_SIZE = 100;

export default async function ComposicoesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; orgao?: string; origem?: string; page?: string }>;
}) {
  const { q, orgao, origem, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const qs = new URLSearchParams()
  if (q) qs.set('q', q)
  if (orgao) qs.set('orgao', orgao)
  if (origem) qs.set('origem', origem)
  const baseHref = `/composicoes${qs.toString() ? '?' + qs.toString() : ''}`

  const supabase = await createClient();
  const sb = supabase as any;

  const { data: basesRaw } = await sb
    .from('tabela_bases')
    .select('id, nome, orgao, tipo_base')
    .order('tipo_base')
    .order('orgao');
  const bases = (basesRaw ?? []) as { id: string; nome: string; orgao: string; tipo_base: string }[];

  let baseIdFiltro: string | null = null;
  if (orgao && orgao !== 'SEM_BASE') {
    const match = bases.find((b) => b.orgao === orgao);
    if (match) baseIdFiltro = match.id;
  }

  function addFilters(query: any) {
    if (q) query = query.or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`)
    if (orgao === 'SEM_BASE') query = query.is('base_id', null)
    else if (baseIdFiltro) query = query.eq('base_id', baseIdFiltro)
    if (origem) query = query.eq('base_origem', origem)
    return query
  }

  // count
  const countResult = await addFilters(
    sb.from('vw_custo_composicao').select('id', { count: 'exact' }).range(0, 0)
  )
  const total: number = countResult.count ?? 0

  // data page
  const { data: composicoes, error } = await addFilters(
    sb
      .from('vw_custo_composicao')
      .select('id, codigo, descricao, unidade, base_id, orgao, tipo_base, custo_unitario, base_origem')
      .order('codigo')
      .range(from, to)
  )
  if (error) throw error;

  // Busca insumos para as composições da página atual (servidor)
  const compIds = (composicoes ?? []).map((c: any) => c.id as string)
  let insumosPorComp: Record<string, ComposicaoParaExport['insumos']> = {}
  if (compIds.length > 0) {
    const { data: itens } = await sb
      .from('tabela_itens_composicao')
      .select('composicao_id, indice, tabela_insumos(codigo, descricao, unidade, preco_base, grupo)')
      .in('composicao_id', compIds)
    for (const it of itens ?? []) {
      const ins = it.tabela_insumos
      if (!ins) continue
      if (!insumosPorComp[it.composicao_id]) insumosPorComp[it.composicao_id] = []
      insumosPorComp[it.composicao_id]!.push({
        codigo: ins.codigo ?? '',
        descricao: ins.descricao ?? '',
        unidade: ins.unidade ?? '',
        custo: ins.preco_base ?? 0,
        indice: it.indice ?? 0,
        grupo: ins.grupo ?? null,
      })
    }
  }

  const composicoesParaExport: ComposicaoParaExport[] = (composicoes ?? []).map((c: any) => ({
    id: c.id,
    codigo: c.codigo,
    descricao: c.descricao,
    unidade: c.unidade,
    custo_unitario: c.custo_unitario ?? 0,
    insumos: insumosPorComp[c.id] ?? [],
  }))

  const baseOptions = bases.map((b) => ({
    orgao: b.orgao,
    label: b.tipo_base === 'propria' ? 'Minha Base' : baseLabelFromOrgao(b.orgao),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Composições</h1>
          <p className="mt-1 text-sm text-gray-500">
            Biblioteca de serviços
            {total > 0 && <> · <span className="font-medium">{total.toLocaleString('pt-BR')}</span> itens</>}
          </p>
        </div>
        <div className="flex gap-2">
          <ExportComposicoesButton composicoes={composicoesParaExport} />
          <Link
            href="/composicoes/nova"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Nova composição
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <Suspense>
          <SearchInput placeholder="Buscar por código ou descrição..." />
        </Suspense>
        {baseOptions.length > 0 && (
          <Suspense>
            <BaseFilter bases={baseOptions} />
          </Suspense>
        )}
      </div>

      <ComposicoesTable initialComposicoes={(composicoes ?? []) as ComposicaoView[]} />

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} baseHref={baseHref} />
    </div>
  );
}
