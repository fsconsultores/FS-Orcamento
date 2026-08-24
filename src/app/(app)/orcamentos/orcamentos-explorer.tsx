'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { SearchInput } from '@/components/search-input';
import { FavoritosFilterToggle } from '@/components/favoritos-filter-toggle';
import { ModelosFilterToggle } from '@/components/modelos-filter-toggle';
import { FilterBanner } from '@/components/ui/filter-banner';
import { OrcamentosGrid } from './orcamentos-list';
import { searchOrcamentosAction } from './search-action';
import type { OrcamentosData, OrcamentosFilters } from './types';

function filtersFromSearch(search: string): OrcamentosFilters {
  const p = new URLSearchParams(search);
  const modelos = p.get('modelos') === '1';
  return {
    q: p.get('q') ?? '',
    favoritos: !modelos && p.get('favoritos') === '1',
    modelos,
    semVersao: p.get('semVersao') === '1',
  };
}

function buildUrl(filters: OrcamentosFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.modelos) params.set('modelos', '1');
  else if (filters.favoritos) params.set('favoritos', '1');
  if (filters.semVersao) params.set('semVersao', '1');
  const qs = params.toString();
  return `/orcamentos${qs ? `?${qs}` : ''}`;
}

interface Props {
  initialFilters: OrcamentosFilters;
  initialData: OrcamentosData;
  currentUserId: string | null;
}

export function OrcamentosExplorer({ initialFilters, initialData, currentUserId }: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const [data, setData] = useState(initialData);
  const genRef = useRef(0);

  function runSearch(nextFilters: OrcamentosFilters) {
    setFilters(nextFilters);
    window.history.replaceState(window.history.state, '', buildUrl(nextFilters));

    const myGen = ++genRef.current;
    searchOrcamentosAction(nextFilters).then((result) => {
      if (genRef.current !== myGen) return;
      setData(result);
    });
  }

  function handleFilterChange(patch: Partial<OrcamentosFilters>) {
    runSearch({ ...filters, ...patch });
  }

  useEffect(() => {
    function onPopState() {
      runSearch(filtersFromSearch(window.location.search));
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearSemVersao = () => handleFilterChange({ semVersao: false });

  return (
    <div className="space-y-6">
      {filters.semVersao && (
        <FilterBanner
          label={`Mostrando ${data.orcamentos.length.toLocaleString('pt-BR')} ${data.orcamentos.length === 1 ? 'orçamento sem versão salva' : 'orçamentos sem versão salva'}`}
          onClear={clearSemVersao}
        />
      )}
      <OrcamentosGrid
        initialOrcamentos={data.orcamentos}
        totaisMap={data.totaisMap}
        favoritosAtivo={filters.favoritos}
        modelosAtivo={filters.modelos}
        currentUserId={currentUserId}
        query={filters.q}
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="sm:max-w-xs sm:flex-1">
            <Suspense>
              <SearchInput placeholder="Buscar por obra, cliente ou código..." debounce={300} initialValue={initialFilters.q} onChange={(q) => handleFilterChange({ q })} />
            </Suspense>
          </div>
          <div className="flex items-center gap-2">
            <Suspense>
              <FavoritosFilterToggle active={filters.favoritos} onChange={(favoritos) => handleFilterChange({ favoritos, modelos: favoritos ? false : filters.modelos })} />
            </Suspense>
            <Suspense>
              <ModelosFilterToggle active={filters.modelos} onChange={(modelos) => handleFilterChange({ modelos, favoritos: modelos ? false : filters.favoritos })} />
            </Suspense>
          </div>
        </div>
      </OrcamentosGrid>
    </div>
  );
}
