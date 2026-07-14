import Link from 'next/link';
import { Suspense } from 'react';
import { Plus, Layers3, Database, Coins, HelpCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { SearchInput } from '@/components/search-input';
import { BaseFilter } from '@/components/base-filter';
import { baseLabelFromOrgao } from '@/components/base-labels';
import { ComposicoesTable } from './composicoes-table';
import { ExportComposicoesButton } from '@/components/export-composicoes-button';
import type { ComposicaoParaExport } from '@/components/export-composicoes-button';
import { Pagination } from '@/components/pagination';
import { PageHeader, Toolbar } from '@/components/ui/toolbar';
import { StatRow, StatCard } from '@/components/ui/stat-row';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/costs';

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

  // count total + count sem base + data da página, em paralelo
  const [countResult, semBaseResult, { data: composicoes, error }] = await Promise.all([
    addFilters(sb.from('vw_custo_composicao').select('id', { count: 'exact' }).range(0, 0)),
    addFilters(sb.from('vw_custo_composicao').select('id', { count: 'exact' }).is('base_id', null).range(0, 0)),
    addFilters(
      sb.from('vw_custo_composicao')
        .select('id, codigo, descricao, unidade, base_id, orgao, tipo_base, custo_unitario, base_origem')
        .order('codigo')
        .range(from, to)
    ),
  ])
  if (error) throw error;
  const total: number = countResult.count ?? 0
  const semBase: number = semBaseResult.count ?? 0

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

  const basesPropias = bases.filter((b) => b.tipo_base === 'propria').length;
  const custoMedioPagina = composicoesParaExport.length > 0
    ? composicoesParaExport.reduce((acc, c) => acc + (c.custo_unitario ?? 0), 0) / composicoesParaExport.length
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Composições"
        description="Biblioteca de serviços (mão de obra + insumos decompostos)."
        actions={
          <>
            <ExportComposicoesButton composicoes={composicoesParaExport} />
            <Link href="/composicoes/nova">
              <Button icon={<Plus size={15} />}>Nova composição</Button>
            </Link>
          </>
        }
      />

      <Toolbar
        search={
          <Suspense>
            <SearchInput placeholder="Buscar por código ou descrição..." />
          </Suspense>
        }
        filters={
          baseOptions.length > 0 ? (
            <Suspense>
              <BaseFilter bases={baseOptions} />
            </Suspense>
          ) : undefined
        }
      />

      <StatRow>
        <StatCard label="Itens encontrados" value={total.toLocaleString('pt-BR')} icon={<Layers3 size={16} />} />
        <StatCard label="Bases carregadas" value={bases.length} icon={<Database size={16} />} hint={basesPropias > 0 ? `${basesPropias} própria(s)` : undefined} />
        <StatCard label="Custo médio" value={formatCurrency(custoMedioPagina)} icon={<Coins size={16} />} hint="nesta página" />
        <StatCard label="Sem base vinculada" value={semBase.toLocaleString('pt-BR')} icon={<HelpCircle size={16} />} />
      </StatRow>

      <ComposicoesTable initialComposicoes={(composicoes ?? []) as ComposicaoView[]} />

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} baseHref={baseHref} />
    </div>
  );
}
