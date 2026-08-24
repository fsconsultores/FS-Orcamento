'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Package, Layers3, UploadCloud } from 'lucide-react';
import { SearchInput } from '@/components/search-input';
import { Pagination } from '@/components/pagination';
import { Toolbar } from '@/components/ui/toolbar';
import { StatRow, StatCard } from '@/components/ui/stat-row';
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { HighlightMatch } from '@/components/ui/highlight-match';
import { formatDateOnly } from '@/lib/format-date';
import { baseLabelFromOrgao } from '@/components/base-labels';
import { formatCurrency } from '@/lib/costs';
import { BaseTabs } from './base-tabs';
import { searchBaseDetailAction } from './search-action';
import { BASE_DETAIL_PAGE_SIZE, type BaseDetailData, type BaseDetailFilters, type BaseDetailTab } from './types';

function filtersFromSearch(search: string): { filters: BaseDetailFilters; page: number } {
  const p = new URLSearchParams(search);
  return {
    filters: {
      tab: p.get('tab') === 'composicoes' ? 'composicoes' : 'insumos',
      q: p.get('q') ?? '',
    },
    page: Math.max(1, parseInt(p.get('page') ?? '1', 10) || 1),
  };
}

function buildUrl(id: string, filters: BaseDetailFilters, page: number): string {
  const params = new URLSearchParams();
  params.set('tab', filters.tab);
  if (filters.q) params.set('q', filters.q);
  if (page > 1) params.set('page', String(page));
  return `/bases/${id}?${params.toString()}`;
}

interface Props {
  id: string;
  initialFilters: BaseDetailFilters;
  initialPage: number;
  initialData: BaseDetailData;
}

export function BaseDetailExplorer({ id, initialFilters, initialPage, initialData }: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState(initialData);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);

  function runSearch(nextFilters: BaseDetailFilters, nextPage: number) {
    setFilters(nextFilters);
    setPage(nextPage);
    window.history.replaceState(window.history.state, '', buildUrl(id, nextFilters, nextPage));

    const myGen = ++genRef.current;
    setLoading(true);
    searchBaseDetailAction(id, nextFilters, nextPage)
      .then((result) => {
        if (genRef.current !== myGen) return;
        setData(result);
        setDataVersion((v) => v + 1);
      })
      .finally(() => {
        if (genRef.current !== myGen) return;
        setLoading(false);
      });
  }

  function handleTabChange(tab: BaseDetailTab) {
    if (tab === filters.tab) return;
    runSearch({ ...filters, tab }, 1);
  }

  function handleSearchChange(q: string) {
    runSearch({ ...filters, q }, 1);
  }

  useEffect(() => {
    function onPopState() {
      const { filters: f, page: p } = filtersFromSearch(window.location.search);
      runSearch(f, p);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { base, totalInsumos, totalComposicoes, total, insumos, composicoes } = data;
  const nomeExibicao = base.tipo_base === 'propria' ? base.orgao : baseLabelFromOrgao(base.orgao);

  return (
    <div className="space-y-6">
      <Link href="/bases" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={14} /> Voltar para Bases
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{nomeExibicao}</h1>
          <p className="mt-1 text-sm text-gray-500">Conteúdo desta base — insumos e composições disponíveis para importar em qualquer orçamento.</p>
        </div>
        <Link href={`/bases/${id}/importar` as any}>
          <Button variant="outline" icon={<UploadCloud size={15} />}>Importar mais dados</Button>
        </Link>
      </div>

      <StatRow>
        <StatCard label="Insumos" value={totalInsumos.toLocaleString('pt-BR')} icon={<Package size={16} />} />
        <StatCard label="Composições" value={totalComposicoes.toLocaleString('pt-BR')} icon={<Layers3 size={16} />} />
      </StatRow>

      <BaseTabs tab={filters.tab} onChange={handleTabChange} />

      <Toolbar
        search={
          <Suspense>
            <SearchInput placeholder="Buscar por código ou descrição..." initialValue={initialFilters.q} onChange={handleSearchChange} />
          </Suspense>
        }
      />

      <div key={dataVersion} className={loading ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}>
        {filters.tab === 'insumos' ? (
          insumos.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <EmptyState icon={<Package size={20} />} title="Nenhum insumo encontrado" description={filters.q ? 'Ajuste a busca.' : 'Esta base ainda não tem insumos importados.'} />
            </div>
          ) : (
            <Table>
              <Thead>
                <Th className="w-28">Código</Th>
                <Th>Descrição</Th>
                <Th className="w-36">Grupo</Th>
                <Th className="w-20">Unidade</Th>
                <Th className="w-36 text-right">Custo</Th>
                <Th className="w-28">Data ref.</Th>
              </Thead>
              <Tbody>
                {insumos.map((ins) => (
                  <Tr key={ins.id}>
                    <Td className="font-mono text-xs text-gray-500"><HighlightMatch text={ins.codigo} query={filters.q} /></Td>
                    <Td className="text-gray-900"><HighlightMatch text={ins.descricao} query={filters.q} /></Td>
                    <Td className="text-gray-600">{ins.grupo ?? '—'}</Td>
                    <Td className="text-gray-600">{ins.unidade}</Td>
                    <Td className="text-right font-medium tabular-nums text-gray-900">{formatCurrency(ins.preco_base)}</Td>
                    <Td className="text-gray-500">{formatDateOnly(ins.data_referencia)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )
        ) : composicoes.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <EmptyState icon={<Layers3 size={20} />} title="Nenhuma composição encontrada" description={filters.q ? 'Ajuste a busca.' : 'Esta base ainda não tem composições importadas.'} />
          </div>
        ) : (
          <Table>
            <Thead>
              <Th className="w-28">Código</Th>
              <Th>Descrição</Th>
              <Th className="w-20">Unidade</Th>
              <Th className="w-36 text-right">Custo unit.</Th>
              <Th className="w-28">Status</Th>
            </Thead>
            <Tbody>
              {composicoes.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-mono text-xs text-gray-500"><HighlightMatch text={c.codigo} query={filters.q} /></Td>
                  <Td className="text-gray-900"><HighlightMatch text={c.descricao} query={filters.q} /></Td>
                  <Td className="text-gray-600">{c.unidade}</Td>
                  <Td className="text-right font-medium tabular-nums text-gray-900">{formatCurrency(c.custo_unitario)}</Td>
                  <Td>
                    {c.incompleta
                      ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Incompleta</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      <Pagination total={total} page={page} pageSize={BASE_DETAIL_PAGE_SIZE} baseHref="" onPageChange={(p) => runSearch(filters, p)} />
    </div>
  );
}
