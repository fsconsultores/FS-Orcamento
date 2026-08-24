import { BaseDetailExplorer } from './base-detail-explorer';
import { fetchBaseDetail } from './fetch-base-detail';
import type { BaseDetailFilters } from './types';

/**
 * Conteúdo de uma base global — só visualização/busca (edição continua
 * pelas telas /insumos e /composicoes, que já suportam isso). Filtra
 * direto por base_id (mais preciso que o filtro por nome/órgão usado nessas
 * duas telas, que existe pra outro propósito: comparar entre bases).
 */
export default async function BaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam, q, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

  const filters: BaseDetailFilters = {
    tab: tabParam === 'composicoes' ? 'composicoes' : 'insumos',
    q: q ?? '',
  };

  const data = await fetchBaseDetail(id, filters, page);

  return <BaseDetailExplorer id={id} initialFilters={filters} initialPage={page} initialData={data} />;
}
