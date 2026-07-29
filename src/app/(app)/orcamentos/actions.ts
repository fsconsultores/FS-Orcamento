'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/supabase/auth'
import { registrarHistorico } from '@/lib/log'
import { duplicarOrcamento, criarOrcamentoAPartirDeModelo, type DadosNovoOrcamentoDeModelo } from '@/lib/orcamento/duplicate'
import { removerFavoritosDaEntidade } from '@/lib/favoritos'


export async function deleteOrcamento(orcamentoId: string): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any
  await requireUser(supabase)
  const { data: orc } = await sb.from('tabela_orcamentos').select('nome_obra').eq('id', orcamentoId).single()
  // .select('id') é necessário pra saber se o delete realmente afetou
  // alguma linha (ex.: orçamento já excluído por outro usuário em paralelo)
  // — sem isso, um delete com 0 linhas retorna sucesso silencioso.
  const { data: deleted, error } = await sb.from('tabela_orcamentos').delete().eq('id', orcamentoId).select('id')
  if (error) throw new Error(`Erro ao excluir orçamento: ${error.message}`)
  if (!deleted?.length) throw new Error('Orçamento não encontrado — pode já ter sido excluído por outro usuário.')
  removerFavoritosDaEntidade(supabase, 'orcamento', orcamentoId).catch(console.error)
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

export type ModeloInfo = { id: string; nome_obra: string; codigo: string; bdi_global: number }

export async function listModelosAction(): Promise<ModeloInfo[]> {
  const supabase = await createClient()
  const sb = supabase as any
  const { data, error } = await sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, codigo, bdi_global')
    .eq('is_modelo', true)
    .order('nome_obra')
  if (error) throw new Error(`Erro ao listar modelos: ${error.message}`)
  return data ?? []
}

export async function criarOrcamentoDeModeloAction(
  modeloId: string,
  dados: DadosNovoOrcamentoDeModelo
) {
  const supabase = await createClient()
  const sb = supabase as any
  const user = await requireUser(supabase)
  const result = await criarOrcamentoAPartirDeModelo(sb, user.id, modeloId, dados)
  revalidatePath('/orcamentos')
  registrarHistorico(supabase, {
    orcamentoId: result.id,
    entidade: 'orcamento',
    tipo: 'sucesso',
    acao: 'criar_orcamento',
    mensagem: `Orçamento "${result.nome_obra}" criado a partir de modelo`,
    detalhes: { modelo_id: modeloId },
  }).catch(console.error)
  return result
}
