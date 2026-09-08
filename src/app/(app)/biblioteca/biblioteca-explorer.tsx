'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Package, Layers3, Pencil, LibraryBig } from 'lucide-react';
import { SearchInput } from '@/components/search-input';
import { Pagination } from '@/components/pagination';
import { Toolbar } from '@/components/ui/toolbar';
import { StatRow, StatCard } from '@/components/ui/stat-row';
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { IconButton } from '@/components/ui/button';
import { HighlightMatch } from '@/components/ui/highlight-match';
import { formatDateOnly } from '@/lib/format-date';
import { formatCurrency } from '@/lib/costs';
import { BaseTabs } from '../bases/[id]/base-tabs';
import { searchBibliotecaAction } from './search-action';
import { BIBLIOTECA_PAGE_SIZE, type BibliotecaData, type BibliotecaFilters, type BibliotecaTab } from './types';
import type { CategoriaAbc } from '@/lib/curva-abc';

const CATEGORIAS: CategoriaAbc[] = ['materiais', 'mao_de_obra', 'equipamentos', 'servicos'];
const CATEGORIA_LABEL: Record<CategoriaAbc, string> = {
  materiais: 'Materiais',
  mao_de_obra: 'Mão de obra',
  equipamentos: 'Equipamentos',
  servicos: 'Serviços',
};

function filtersFromSearch(search: string): { filters: BibliotecaFilters; page: number } {
  const p = new URLSearchParams(search);
  const categoria = p.get('categoria');
  return {
    filters: {
      tab: p.get('tab') === 'composicoes' ? 'composicoes' : 'insumos',
      q: p.get('q') ?? '',
      categoria: CATEGORIAS.includes(categoria as CategoriaAbc) ? (categoria as CategoriaAbc) : null,
    },
    page: Math.max(1, parseInt(p.get('page') ?? '1', 10) || 1),
  };
}

function buildUrl(filters: BibliotecaFilters, page: number): string {
  const params = new URLSearchParams();
  params.set('tab', filters.tab);
  if (filters.q) params.set('q', filters.q);
  if (filters.categoria) params.set('categoria', filters.categoria);
  if (page > 1) params.set('page', String(page));
  return `/biblioteca?${params.toString()}`;
}

interface Props {
  initialFilters: BibliotecaFilters;
  initialPage: number;
  initialData: BibliotecaData;
}

export function BibliotecaExplorer({ initialFilters, initialPage, initialData }: Props) {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState(initialData);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);

  function runSearch(nextFilters: BibliotecaFilters, nextPage: number) {
    setFilters(nextFilters);
    setPage(nextPage);
    window.history.replaceState(window.history.state, '', buildUrl(nextFilters, nextPage));

    const myGen = ++genRef.current;
    setLoading(true);
    searchBibliotecaAction(nextFilters, nextPage)
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

  function handleTabChange(tab: BibliotecaTab) {
    if (tab === filters.tab) return;
    runSearch({ ...filters, tab, categoria: null }, 1);
  }

  function handleSearchChange(q: string) {
    runSearch({ ...filters, q }, 1);
  }

  function handleCategoriaChange(cat: CategoriaAbc) {
    runSearch({ ...filters, categoria: filters.categoria === cat ? null : cat }, 1);
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

  const { totalInsumos, totalComposicoes, total, insumos, composicoes } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-gray-900">
          <LibraryBig size={22} className="text-primary-700" /> Minha Biblioteca
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Insumos e composições que você já usou — reaproveite direto em qualquer orçamento.
        </p>
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

      {filters.tab === 'insumos' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIAS.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoriaChange(cat)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filters.categoria === cat
                  ? 'border-primary-700 bg-primary-700 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {CATEGORIA_LABEL[cat]}
            </button>
          ))}
        </div>
      )}

      <div key={dataVersion} className={loading ? 'opacity-60 pointer-events-none transition-opacity' : 'transition-opacity'}>
        {filters.tab === 'insumos' ? (
          insumos.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <EmptyState
                icon={<Package size={20} />}
                title="Nenhum insumo encontrado"
                description={filters.q || filters.categoria ? 'Ajuste a busca ou o filtro.' : 'Adicione insumos à sua Biblioteca a partir de qualquer orçamento.'}
              />
            </div>
          ) : (
            <Table>
              <Thead>
                <Th className="w-28">Código</Th>
                <Th>Descrição</Th>
                <Th className="w-32">Grupo</Th>
                <Th className="w-20">Unidade</Th>
                <Th className="w-32 text-right">Custo</Th>
                <Th className="w-28">Data ref.</Th>
                <Th className="w-24 text-center">Usado em</Th>
                <Th className="w-16" />
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
                    <Td className="text-center text-gray-600">
                      {ins.usadoEm > 0 ? `${ins.usadoEm} obra${ins.usadoEm > 1 ? 's' : ''}` : <span className="text-gray-300">—</span>}
                    </Td>
                    <Td>
                      <Link href={`/insumos/${ins.id}/editar` as any}>
                        <IconButton icon={<Pencil size={14} />} label="Editar" variant="ghost" size="sm" />
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )
        ) : composicoes.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <EmptyState
              icon={<Layers3 size={20} />}
              title="Nenhuma composição encontrada"
              description={filters.q ? 'Ajuste a busca.' : 'Adicione composições à sua Biblioteca a partir de qualquer orçamento.'}
            />
          </div>
        ) : (
          <Table>
            <Thead>
              <Th className="w-28">Código</Th>
              <Th>Descrição</Th>
              <Th className="w-20">Unidade</Th>
              <Th className="w-32 text-right">Custo unit.</Th>
              <Th className="w-28">Status</Th>
              <Th className="w-24 text-center">Usado em</Th>
              <Th className="w-16" />
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
                  <Td className="text-center text-gray-600">
                    {c.usadoEm > 0 ? `${c.usadoEm} obra${c.usadoEm > 1 ? 's' : ''}` : <span className="text-gray-300">—</span>}
                  </Td>
                  <Td>
                    <Link href={`/composicoes/${c.id}/editar` as any}>
                      <IconButton icon={<Pencil size={14} />} label="Editar" variant="ghost" size="sm" />
                    </Link>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      <Pagination total={total} page={page} pageSize={BIBLIOTECA_PAGE_SIZE} baseHref="" onPageChange={(p) => runSearch(filters, p)} />
    </div>
  );
}
