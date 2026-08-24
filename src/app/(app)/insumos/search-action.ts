'use server';

import { fetchInsumosPage } from './fetch-insumos';
import type { InsumosFilters, InsumosPageData } from './types';

/**
 * Chamada diretamente do client (InsumosExplorer) a cada busca/filtro —
 * substitui a navegação via router.replace()/refresh(), que intermitentemente
 * falhava em produção (ver use-reliable-replace.ts). Não usa searchParams/URL
 * como fonte de verdade: o client manda os filtros explicitamente.
 */
export async function searchInsumosAction(filters: InsumosFilters, page: number): Promise<InsumosPageData> {
  return fetchInsumosPage(filters, page);
}
