'use server';

import { createClient } from '@/lib/supabase/server';
import { fetchCadernoDataForEscopo } from './fetch-relatorio-data';
import type { EscopoPlanilha } from './filters/planilha-selector';

/** Chamada direto do client (RelatoriosView) ao trocar o escopo de
 * planilhas — sem navegar (ver fetch-relatorio-data.ts). */
export async function searchRelatorioDataAction(
  orcamentoId: string,
  escopo: EscopoPlanilha,
  planilhaAtualId: string | null,
  planilhaIdsSelecionadas: string[]
) {
  const supabase = await createClient();
  return fetchCadernoDataForEscopo(supabase, orcamentoId, escopo, planilhaAtualId, planilhaIdsSelecionadas);
}
