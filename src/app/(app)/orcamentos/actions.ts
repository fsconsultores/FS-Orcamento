'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/supabase/auth'
import { logAction } from '@/lib/log'
import { duplicarOrcamento } from '@/lib/orcamento/duplicate'


export async function deleteOrcamento(orcamentoId: string): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any
  const user = await requireUser(supabase)
  const { data: orc } = await sb.from('tabela_orcamentos').select('nome_obra').eq('id', orcamentoId).single()
  const { error } = await sb.from('tabela_orcamentos').delete().eq('id', orcamentoId)
  if (error) throw new Error(`Erro ao excluir orçamento: ${error.message}`)
  revalidatePath('/orcamentos')
  logAction(supabase, {
    usuario: user.email ?? '',
    tipo: 'sucesso',
    acao: 'excluir_orcamento',
    mensagem: `Orçamento "${orc?.nome_obra ?? orcamentoId}" excluído`,
  }).catch(console.error)
}

export async function duplicateOrcamento(orcamentoId: string, novoCodigo: string) {
  const supabase = await createClient()
  const sb = supabase as any
  const user = await requireUser(supabase)
  const result = await duplicarOrcamento(sb, user.id, orcamentoId, novoCodigo)
  revalidatePath('/orcamentos')
  logAction(supabase, {
    usuario: user.email ?? '',
    tipo: 'sucesso',
    acao: 'duplicar_orcamento',
    mensagem: `Orçamento "${result.nome_obra}" criado como cópia`,
    contexto: { orcamento_origem: orcamentoId, novo_id: result.id, codigo: novoCodigo },
  }).catch(console.error)
  return result
}
