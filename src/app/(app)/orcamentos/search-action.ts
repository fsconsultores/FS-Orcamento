'use server';

import { fetchOrcamentos } from './fetch-orcamentos';
import type { OrcamentosFilters, OrcamentosData } from './types';

/** Chamada direto do client (OrcamentosExplorer) a cada busca/filtro — sem
 * navegar (ver fetch-orcamentos.ts). */
export async function searchOrcamentosAction(filters: OrcamentosFilters): Promise<OrcamentosData> {
  return fetchOrcamentos(filters);
}
