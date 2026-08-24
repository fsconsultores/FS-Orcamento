import { ComposicoesExplorer } from './composicoes-explorer';
import { fetchComposicoesPage } from './fetch-composicoes';
import type { ComposicoesFilters } from './types';

export default async function ComposicoesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; orgao?: string; origem?: string; page?: string; favoritos?: string; incompletas?: string }>;
}) {
  const { q, orgao, origem, page: pageParam, favoritos, incompletas } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

  const filters: ComposicoesFilters = {
    q: q ?? '',
    orgao: orgao ?? '',
    origem: origem ?? '',
    favoritos: favoritos === '1',
    incompletas: incompletas === '1',
  };

  const data = await fetchComposicoesPage(filters, page);

  return <ComposicoesExplorer initialFilters={filters} initialPage={page} initialData={data} />;
}
