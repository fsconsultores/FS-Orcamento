'use server';

import { fetchBiblioteca } from './fetch-biblioteca';
import type { BibliotecaFilters, BibliotecaData } from './types';

/** Chamada direto do client (BibliotecaExplorer) — mesmo padrão de search-action.ts em /bases/[id]. */
export async function searchBibliotecaAction(filters: BibliotecaFilters, page: number): Promise<BibliotecaData> {
  return fetchBiblioteca(filters, page);
}
