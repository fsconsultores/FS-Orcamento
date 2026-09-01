'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Plus, UploadCloud, Layers3, Database, Coins, HelpCircle } from 'lucide-react';
import { SearchInput } from '@/components/search-input';
import { BaseFilter } from '@/components/base-filter';
import { FavoritosFilterToggle } from '@/components/favoritos-filter-toggle';
import { FilterBanner } from '@/components/ui/filter-banner';
import { Toolbar } from '@/components/ui/toolbar';
import { StatRow, StatCard } from '@/components/ui/stat-row';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { ExportComposicoesButton } from '@/components/export-composicoes-button';
import { formatCurrency } from '@/lib/costs';
import { ComposicoesTable } from './composicoes-table';
import { searchComposicoesAction } from './search-action';
import { exportComposicoesAction } from './export-action';
import { COMPOSICOES_PAGE_SIZE, type ComposicoesFilters, type ComposicoesPageData } from './types';

function filtersFromSearch(search: string): { filters: ComposicoesFilters; page: number } {
  const p = new URLSearchParams(search);
  return {
    filters: {
      q: p.get('q') ?? '',
      orgao: p.get('orgao') ?? '',
      origem: p.get('origem') ?? '',
      favoritos: p.get('favoritos') === '1',
      incompletas: p.get('incompletas') === '1',
    },
    page: Math.max(1, parseInt(p.get('page') ?? '1', 10) || 1),
  };
}

function buildUrl(filters: ComposicoesFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.orgao) params.set('orgao', filters.orgao);
  if (filters.origem) params.set('origem', filters.origem);
  if (filters.favoritos) params.set('favoritos', '1');
  if (filters.incompletas) params.set('incompletas', '1');
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/composicoes${qs ? `?${qs}` : ''}`;
}

interface Props {
  initialFilters: ComposicoesFilters;
  initialPage: number;
  initialData: ComposicoesPageData;
}

export function ComposicoesExplorer({ initialFilters, initialPage, initialData }: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState(initialData);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);

  function runSearch(nextFilters: ComposicoesFilters, nextPage: number) {
    setFilters(nextFilters);
    setPage(nextPage);
    window.history.replaceState(window.history.state, '', buildUrl(nextFilters, nextPage));

    const myGen = ++genRef.current;
    setLoading(true);
    searchComposicoesAction(nextFilters, nextPage)
      .then((result) => {
        if (genRef.current !== myGen) return;
        setData(result);
        // ComposicoesTable só lê `initialComposicoes` uma vez (useState
        // interno) — precisa remontar quando os DADOS mudam de fato. Uma key
        // baseada em filters/page mudava cedo demais (no clique, antes do
        // fetch resolver), remontando a tabela com o `data` ainda antigo.
        setDataVersion((v) => v + 1);
      })
      .finally(() => {
        if (genRef.current !== myGen) return;
        setLoading(false);
      });
  }

  function handleFilterChange(patch: Partial<ComposicoesFilters>) {
    runSearch({ ...filters, ...patch }, 1);
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

  const { composicoes, total, semBase, baseOptions, basesPropias, custoMedioPagina } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Composições</h1>
          <p className="mt-1 text-sm text-gray-500">Biblioteca de serviços (mão de obra + insumos decompostos).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportComposicoesButton
            fetchComposicoes={() => exportComposicoesAction(filters)}
          />
          <Link href="/composicoes/importar">
            <Button variant="outline" icon={<UploadCloud size={15} />}>Importar</Button>
          </Link>
          <Link href="/composicoes/nova">
            <Button icon={<Plus size={15} />}>Nova composição</Button>
          </Link>
        </div>
      </div>

      {filters.incompletas && (
        <FilterBanner
          label={`Mostrando ${total.toLocaleString('pt-BR')} ${total === 1 ? 'composição incompleta' : 'composições incompletas'} (sem nenhum insumo vinculado)`}
          onClear={() => handleFilterChange({ incompletas: false })}
        />
      )}

      <Toolbar
        search={
          <Suspense>
            <SearchInput
              placeholder="Buscar por código ou descrição..."
              initialValue={initialFilters.q}
              onChange={(q) => handleFilterChange({ q })}
            />
          </Suspense>
        }
        filters={
          <>
            {baseOptions.length > 0 && (
              <Suspense>
                <BaseFilter bases={baseOptions} value={filters.orgao} onChange={(orgao) => handleFilterChange({ orgao })} />
              </Suspense>
            )}
            <Suspense>
              <FavoritosFilterToggle active={filters.favoritos} onChange={(favoritos) => handleFilterChange({ favoritos })} />
            </Suspense>
          </>
        }
      />

      <StatRow>
        <StatCard label="Itens encontrados" value={total.toLocaleString('pt-BR')} icon={<Layers3 size={16} />} />
        <StatCard label="Bases carregadas" value={data.bases.length} icon={<Database size={16} />} hint={basesPropias > 0 ? `${basesPropias} própria(s)` : undefined} />
        <StatCard label="Custo médio" value={formatCurrency(custoMedioPagina)} icon={<Coins size={16} />} hint="nesta página" />
        <StatCard label="Sem base vinculada" value={semBase.toLocaleString('pt-BR')} icon={<HelpCircle size={16} />} />
      </StatRow>

      <div className={loading ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}>
        <ComposicoesTable
          key={dataVersion}
          initialComposicoes={composicoes}
          favoritosAtivo={filters.favoritos}
          query={filters.q}
        />
      </div>

      <Pagination
        total={total}
        page={page}
        pageSize={COMPOSICOES_PAGE_SIZE}
        baseHref=""
        onPageChange={(p) => runSearch(filters, p)}
      />
    </div>
  );
}
