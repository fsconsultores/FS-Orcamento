'use server';

import { fetchComposicoesPage } from './fetch-composicoes';
import type { ComposicoesFilters, ComposicoesPageData } from './types';

/**
 * Chamada diretamente do client (ComposicoesExplorer) a cada busca/filtro —
 * substitui a navegação via router.replace()/refresh(), que intermitentemente
 * falhava em produção (ver use-reliable-replace.ts). Não usa searchParams/URL
 * como fonte de verdade: o client manda os filtros explicitamente.
 */
export async function searchComposicoesAction(filters: ComposicoesFilters, page: number): Promise<ComposicoesPageData> {
  return fetchComposicoesPage(filters, page);
}
