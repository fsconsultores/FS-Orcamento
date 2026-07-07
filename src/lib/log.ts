import type { SupabaseClient } from '@supabase/supabase-js'

export type TipoLog = 'info' | 'sucesso' | 'erro'

export interface RegistrarHistoricoParams {
  acao: string
  mensagem: string
  tipo?: TipoLog
  orcamentoId?: string | null
  planilhaId?: string | null
  entidade?: string | null
  valorAnterior?: unknown
  valorNovo?: unknown
  detalhes?: Record<string, unknown>
}

/**
 * Registra um evento no histórico de alterações/auditoria (tabela única,
 * substitui os antigos logAction/tabela_logs e registrarLog/orcamento_logs).
 * orcamentoId ausente/null = evento global, sem projeto associado.
 * Nunca lança — auditoria não deve interromper o fluxo principal.
 */
export async function registrarHistorico(
  supabase: SupabaseClient,
  params: RegistrarHistoricoParams
): Promise<void> {
  try {
    const sb = supabase as any
    const { data: { user } } = await sb.auth.getUser()
    await sb.from('historico_alteracoes').insert({
      orcamento_id: params.orcamentoId ?? null,
      planilha_id: params.planilhaId ?? null,
      user_id: user?.id ?? null,
      usuario_email: user?.email ?? null,
      tipo: params.tipo ?? 'info',
      acao: params.acao,
      entidade: params.entidade ?? null,
      mensagem: params.mensagem,
      valor_anterior: params.valorAnterior ?? null,
      valor_novo: params.valorNovo ?? null,
      detalhes: params.detalhes ?? null,
    })
  } catch {
    // auditoria não-crítica
  }
}
