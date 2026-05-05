import type { SupabaseClient } from '@supabase/supabase-js'

export type TipoLog = 'info' | 'sucesso' | 'erro'

export async function logAction(
  supabase: SupabaseClient,
  params: {
    usuario: string
    tipo: TipoLog
    acao: string
    mensagem: string
    contexto?: Record<string, unknown>
    empresa?: string
  }
) {
  await supabase.from('tabela_logs').insert({
    empresa: params.empresa ?? 'FS Consultores',
    usuario: params.usuario,
    tipo: params.tipo,
    acao: params.acao,
    mensagem: params.mensagem,
    contexto: params.contexto ?? null,
  })
}
