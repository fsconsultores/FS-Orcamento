'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/supabase/auth'
import { registrarHistorico } from '@/lib/log'
import { duplicarOrcamento } from '@/lib/orcamento/duplicate'


export async function deleteOrcamento(orcamentoId: string): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any
  await requireUser(supabase)
  const { data: orc } = await sb.from('tabela_orcamentos').select('nome_obra').eq('id', orcamentoId).single()
  const { error } = await sb.from('tabela_orcamentos').delete().eq('id', orcamentoId)
  if (error) throw new Error(`Erro ao excluir orçamento: ${error.message}`)
  revalidatePath('/orcamentos')
  // orcamento_id não é enviado aqui de propósito: o orçamento já foi excluído
  // (ON DELETE CASCADE apagaria este próprio registro de auditoria também).
  registrarHistorico(supabase, {
    entidade: 'orcamento',
    tipo: 'sucesso',
    acao: 'excluir_orcamento',
    mensagem: `Orçamento "${orc?.nome_obra ?? orcamentoId}" excluído`,
    valorAnterior: orc ?? undefined,
  }).catch(console.error)
}

export async function duplicateOrcamento(orcamentoId: string, novoCodigo: string) {
  const supabase = await createClient()
  const sb = supabase as any
  const user = await requireUser(supabase)
  const result = await duplicarOrcamento(sb, user.id, orcamentoId, novoCodigo)
  revalidatePath('/orcamentos')
  registrarHistorico(supabase, {
    orcamentoId: result.id,
    entidade: 'orcamento',
    tipo: 'sucesso',
    acao: 'duplicar_orcamento',
    mensagem: `Orçamento "${result.nome_obra}" criado como cópia`,
    detalhes: { orcamento_origem: orcamentoId, codigo: novoCodigo },
  }).catch(console.error)
  return result
}
