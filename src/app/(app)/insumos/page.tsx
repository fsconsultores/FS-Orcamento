import { InsumosExplorer } from './insumos-explorer';
import { fetchInsumosPage } from './fetch-insumos';
import type { InsumosFilters } from './types';

export default async function InsumosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; orgao?: string; origem?: string; page?: string; favoritos?: string; semPreco?: string }>;
}) {
  const { q, orgao, origem, page: pageParam, favoritos, semPreco } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

  const filters: InsumosFilters = {
    q: q ?? '',
    orgao: orgao ?? '',
    origem: origem ?? '',
    favoritos: favoritos === '1',
    semPreco: semPreco === '1',
  };

  const data = await fetchInsumosPage(filters, page);

  return <InsumosExplorer initialFilters={filters} initialPage={page} initialData={data} />;
}
