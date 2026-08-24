'use server';

import { fetchBaseDetail } from './fetch-base-detail';
import type { BaseDetailFilters, BaseDetailData } from './types';

/** Chamada direto do client (BaseDetailExplorer) — troca de aba e busca não
 * navegam mais (ver fetch-base-detail.ts). */
export async function searchBaseDetailAction(id: string, filters: BaseDetailFilters, page: number): Promise<BaseDetailData> {
  return fetchBaseDetail(id, filters, page);
}
