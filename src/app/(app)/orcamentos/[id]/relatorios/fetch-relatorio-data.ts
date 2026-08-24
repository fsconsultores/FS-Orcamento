import type { SupabaseClient } from '@supabase/supabase-js';
import { getCadernoData } from '@/lib/orcamento';
import type { EscopoPlanilha } from './filters/planilha-selector';

/**
 * Deriva quais planilha_ids entram na consulta a partir do escopo escolhido
 * — extraído de page.tsx para ser reaproveitado tanto no carregamento
 * inicial (Server Component) quanto na troca de escopo via Server Action
 * (ver search-action.ts), sem depender de router.replace()/refresh() (ver
 * use-reliable-replace.ts e a conversa de 2026-08-24).
 */
export function planilhaIdsParaQuery(
  escopo: EscopoPlanilha,
  planilhaAtualId: string | null,
  planilhaIdsSelecionadas: string[]
): string[] | null {
  if (escopo === 'atual') return planilhaAtualId ? [planilhaAtualId] : null;
  if (escopo === 'selecionar') return planilhaIdsSelecionadas.length > 0 ? planilhaIdsSelecionadas : null;
  return null;
}

export async function fetchCadernoDataForEscopo(
  supabase: SupabaseClient,
  orcamentoId: string,
  escopo: EscopoPlanilha,
  planilhaAtualId: string | null,
  planilhaIdsSelecionadas: string[]
) {
  const ids = planilhaIdsParaQuery(escopo, planilhaAtualId, planilhaIdsSelecionadas);
  return getCadernoData(supabase as any, orcamentoId, ids);
}
