'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/supabase/auth'
import { revalidatePath } from 'next/cache'
import { listarRevisoes, compararInsumosRevisoes, type RevisaoResumo, type ComparacaoRevisoes } from '@/lib/orcamento/revisoes'
import { criarRevisao, type RevisaoResult } from '@/lib/orcamento/duplicate'
import { registrarHistorico } from '@/lib/log'

function revalidarRotasOrcamento(orcamentoId: string) {
  for (const rota of ['planilha', 'composicoes', 'insumos', 'relatorios', 'curva-abc', 'versoes']) {
    revalidatePath(`/orcamentos/${orcamentoId}/${rota}`)
  }
}

// ─── Revisões (cópias independentes — ver auditoria/proposta) ────────────────

export async function listarRevisoesAction(orcamentoId: string): Promise<RevisaoResumo[]> {
  const supabase = await createClient()
  return listarRevisoes(supabase, orcamentoId)
}

/**
 * Carregada sob demanda (botão "Comparar revisões", não no carregamento da
 * página) — busca os avulsos de TODAS as revisões da família pra montar a
 * comparação, custo que só vale a pena pagar quando o usuário realmente pede.
 */
export async function compararRevisoesAction(orcamentoId: string): Promise<ComparacaoRevisoes> {
  const supabase = await createClient()
  return compararInsumosRevisoes(supabase, orcamentoId)
}

/**
 * Cria uma nova revisão a partir do orçamento atualmente aberto — cópia
 * completa e independente (ver criarRevisao em duplicate.ts), na mesma
 * família (grupo_id). Substitui, para o fluxo principal, o antigo caminho
 * "criar versão → criar orçamento desta versão": não exige nenhum snapshot
 * prévio, clona o estado vivo diretamente.
 */
export async function criarRevisaoAction(orcamentoId: string): Promise<RevisaoResult> {
  const supabase = await createClient()
  const sb = supabase as any
  const user = await requireUser(supabase)

  const { data: origem } = await sb.from('tabela_orcamentos').select('nome_obra').eq('id', orcamentoId).single()

  const resultado = await criarRevisao(sb, user.id, user.email ?? null, orcamentoId)

  registrarHistorico(supabase, {
    orcamentoId: resultado.id,
    entidade: 'orcamento',
    tipo: 'sucesso',
    acao: 'revisao_criada',
    mensagem: `Revisão ${resultado.numero_revisao} criada a partir da revisão anterior de "${origem?.nome_obra ?? resultado.nome_obra}"`,
    detalhes: { orcamento_origem_id: orcamentoId, grupo_id: resultado.grupo_id, numero_revisao: resultado.numero_revisao },
  }).catch(console.error)

  revalidatePath('/orcamentos')
  revalidarRotasOrcamento(orcamentoId)
  revalidarRotasOrcamento(resultado.id)

  return resultado
}
