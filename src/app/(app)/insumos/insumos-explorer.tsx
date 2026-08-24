'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { UploadCloud, Plus, Package, Database, Coins, HelpCircle } from 'lucide-react';
import { SearchInput } from '@/components/search-input';
import { BaseFilter } from '@/components/base-filter';
import { FavoritosFilterToggle } from '@/components/favoritos-filter-toggle';
import { FilterBanner } from '@/components/ui/filter-banner';
import { Toolbar } from '@/components/ui/toolbar';
import { StatRow, StatCard } from '@/components/ui/stat-row';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { ExportXlsxButton } from '@/components/export-xlsx-button';
import { formatCurrency } from '@/lib/costs';
import { InsumosTable } from './insumos-table';
import { searchInsumosAction } from './search-action';
import { exportInsumosAction } from './export-action';
import { INSUMOS_PAGE_SIZE, type InsumosFilters, type InsumosPageData } from './types';

function filtersFromSearch(search: string): { filters: InsumosFilters; page: number } {
  const p = new URLSearchParams(search);
  return {
    filters: {
      q: p.get('q') ?? '',
      orgao: p.get('orgao') ?? '',
      origem: p.get('origem') ?? '',
      favoritos: p.get('favoritos') === '1',
      semPreco: p.get('semPreco') === '1',
    },
    page: Math.max(1, parseInt(p.get('page') ?? '1', 10) || 1),
  };
}

function buildUrl(filters: InsumosFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.orgao) params.set('orgao', filters.orgao);
  if (filters.origem) params.set('origem', filters.origem);
  if (filters.favoritos) params.set('favoritos', '1');
  if (filters.semPreco) params.set('semPreco', '1');
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/insumos${qs ? `?${qs}` : ''}`;
}

interface Props {
  initialFilters: InsumosFilters;
  initialPage: number;
  initialData: InsumosPageData;
}

export function InsumosExplorer({ initialFilters, initialPage, initialData }: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState(initialData);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);

  function runSearch(nextFilters: InsumosFilters, nextPage: number) {
    setFilters(nextFilters);
    setPage(nextPage);
    window.history.replaceState(window.history.state, '', buildUrl(nextFilters, nextPage));

    const myGen = ++genRef.current;
    setLoading(true);
    searchInsumosAction(nextFilters, nextPage)
      .then((result) => {
        if (genRef.current !== myGen) return;
        setData(result);
        // InsumosTable só lê `initialInsumos` uma vez (useState interno) —
        // precisa remontar quando os DADOS mudam de fato. Uma key baseada em
        // filters/page mudava cedo demais (no clique, antes do fetch
        // resolver), remontando a tabela com o `data` ainda antigo e nunca
        // mais pegando os dados corretos quando chegavam.
        setDataVersion((v) => v + 1);
      })
      .finally(() => {
        if (genRef.current !== myGen) return;
        setLoading(false);
      });
  }

  function handleFilterChange(patch: Partial<InsumosFilters>) {
    runSearch({ ...filters, ...patch }, 1);
  }

  // Restaura filtros ao navegar com voltar/avançar do browser — a URL é
  // atualizada via history.replaceState (cosmético), não via router, então
  // sem isso o botão voltar mudaria a URL sem refletir na tela.
  useEffect(() => {
    function onPopState() {
      const { filters: f, page: p } = filtersFromSearch(window.location.search);
      runSearch(f, p);
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { insumos, total, semBase, baseOptions, basesPropias, custoMedio } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Insumos</h1>
          <p className="mt-1 text-sm text-gray-500">Biblioteca de materiais e mão de obra usada nos orçamentos.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportXlsxButton
            fetchRows={() => exportInsumosAction({ q: filters.q, orgao: filters.orgao, origem: filters.origem })}
            sheetName="Insumos"
            fileName="insumos.xlsx"
          />
          <Link href="/insumos/importar">
            <Button variant="outline" icon={<UploadCloud size={15} />}>Importar</Button>
          </Link>
          <Link href="/insumos/novo">
            <Button icon={<Plus size={15} />}>Novo insumo</Button>
          </Link>
        </div>
      </div>

      {filters.semPreco && (
        <FilterBanner
          label={`Mostrando ${total.toLocaleString('pt-BR')} ${total === 1 ? 'insumo sem preço' : 'insumos sem preço'}`}
          onClear={() => handleFilterChange({ semPreco: false })}
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
        <StatCard label="Itens encontrados" value={total.toLocaleString('pt-BR')} icon={<Package size={16} />} />
        <StatCard label="Bases carregadas" value={data.bases.length} icon={<Database size={16} />} hint={basesPropias > 0 ? `${basesPropias} própria(s)` : undefined} />
        <StatCard label="Custo médio" value={formatCurrency(custoMedio)} icon={<Coins size={16} />} hint="nesta página" />
        <StatCard label="Sem base vinculada" value={semBase.toLocaleString('pt-BR')} icon={<HelpCircle size={16} />} />
      </StatRow>

      <div className={loading ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}>
        <InsumosTable
          key={dataVersion}
          initialInsumos={insumos}
          favoritosAtivo={filters.favoritos}
          query={filters.q}
        />
      </div>

      <Pagination
        total={total}
        page={page}
        pageSize={INSUMOS_PAGE_SIZE}
        baseHref=""
        onPageChange={(p) => runSearch(filters, p)}
      />
    </div>
  );
}
