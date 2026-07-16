import Link from 'next/link';
import { Suspense } from 'react';
import { Plus, UploadCloud, Package, Database, Coins, HelpCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { SearchInput } from '@/components/search-input';
import { BaseFilter } from '@/components/base-filter';
import { baseLabelFromOrgao } from '@/components/base-labels';
import { InsumosTable } from './insumos-table';
import { ExportXlsxButton } from '@/components/export-xlsx-button';
import { exportInsumosAction } from './export-action';
import { Pagination } from '@/components/pagination';
import { PageHeader, Toolbar } from '@/components/ui/toolbar';
import { StatRow, StatCard } from '@/components/ui/stat-row';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/costs';
import type { InsumoComBase } from '@/lib/supabase/types';

const PAGE_SIZE = 100;

export default async function InsumosPage({
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
  const baseHref = `/insumos${qs.toString() ? '?' + qs.toString() : ''}`

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

  // count + count sem base + dados da página, em paralelo. A busca completa
  // do dataset (para export) NÃO roda mais aqui — em bases grandes (SINAPI
  // chega a dezenas de milhares de itens) isso custava até ~20 round-trips
  // sequenciais em toda visita à página, só para alimentar um botão de
  // export que o usuário pode nunca clicar. Ver export-action.ts.
  const [countResult, semBaseResult, { data: insumos, error }] = await Promise.all([
    addFilters(sb.from('tabela_insumos').select('id', { count: 'exact' }).range(0, 0)),
    addFilters(sb.from('tabela_insumos').select('id', { count: 'exact' }).is('base_id', null).range(0, 0)),
    addFilters(
      sb.from('tabela_insumos')
        .select('id, codigo, descricao, grupo, unidade, preco_base, data_referencia, base_id, base_origem, tabela_bases(orgao, tipo_base)')
        .order('codigo')
        .range(from, to)
    ),
  ])
  if (error) throw error;
  const total: number = countResult.count ?? 0
  const semBase: number = semBaseResult.count ?? 0

  const baseOptions = bases.map((b) => ({
    orgao: b.orgao,
    label: b.tipo_base === 'propria' ? 'Minha Base' : baseLabelFromOrgao(b.orgao),
  }));

  // Custo médio: calculado sobre a página atual (mesmo critério já usado em
  // /composicoes — evita buscar o dataset inteiro só para uma média).
  const insumosPagina = (insumos ?? []) as InsumoComBase[];
  const custoMedio = insumosPagina.length > 0
    ? insumosPagina.reduce((acc, ins) => acc + (ins.preco_base ?? 0), 0) / insumosPagina.length
    : 0;
  const basesPropias = bases.filter((b) => b.tipo_base === 'propria').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insumos"
        description="Biblioteca de materiais e mão de obra usada nos orçamentos."
        actions={
          <>
            <ExportXlsxButton
              fetchRows={exportInsumosAction.bind(null, { q, orgao, origem })}
              sheetName="Insumos"
              fileName="insumos.xlsx"
            />
            <Link href="/insumos/importar">
              <Button variant="outline" icon={<UploadCloud size={15} />}>Importar</Button>
            </Link>
            <Link href="/insumos/novo">
              <Button icon={<Plus size={15} />}>Novo insumo</Button>
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
        <StatCard label="Itens encontrados" value={total.toLocaleString('pt-BR')} icon={<Package size={16} />} />
        <StatCard label="Bases carregadas" value={bases.length} icon={<Database size={16} />} hint={basesPropias > 0 ? `${basesPropias} própria(s)` : undefined} />
        <StatCard label="Custo médio" value={formatCurrency(custoMedio)} icon={<Coins size={16} />} hint="nesta página" />
        <StatCard label="Sem base vinculada" value={semBase.toLocaleString('pt-BR')} icon={<HelpCircle size={16} />} />
      </StatRow>

      <InsumosTable key={`${page}-${q}-${orgao}-${origem}`} initialInsumos={(insumos ?? []) as InsumoComBase[]} />

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} baseHref={baseHref} />
    </div>
  );
}
