'use server'

import { createClient } from '@/lib/supabase/server'
import {
  executarCalculo,
  detectarOrfaos,
  executarLimpeza,
  recalcularComposicaoUnica,
  verificarConsistencia,
} from '@/lib/orcamento/motor-calculo'
import { createPlanilha, deletePlanilha, updatePlanilha, duplicatePlanilha, getOrCreateDefaultPlanilha } from '@/lib/orcamento/planilhas'
import { registrarHistorico } from '@/lib/log'
import type { CalculoResult, ConsistenciaReport } from '@/lib/orcamento/motor-calculo'
import type { OrcamentoPlanilha, OrfaosDetectados } from '@/lib/orcamento/types'

// ── Auto-recalc (chamado automaticamente após mutações) ───────────────────────

/**
 * Recalcula uma única composição e propaga custo para a estrutura.
 * Chamado automaticamente após add/edit/delete de insumos em uma composição.
 */
export async function recalcularComposicaoAction(
  composicaoId: string,
  orcamentoId: string
): Promise<{ custoUnitario: number; itensAtualizados: number }> {
  const supabase = await createClient()
  return recalcularComposicaoUnica(supabase as any, composicaoId, orcamentoId)
}

/**
 * Recalcula o projeto completo com delta detection.
 * Chamado automaticamente após alteração de preço de insumo.
 */
export async function recalcularAutoAction(
  orcamentoId: string,
  planilhaId?: string | null
): Promise<CalculoResult> {
  const supabase = await createClient()
  return executarCalculo(supabase as any, orcamentoId, { modo: 'todas' })
}

// ── Ferramentas de manutenção (chamadas manualmente) ─────────────────────────

/**
 * Recalcula a planilha ativa (força total, ignora delta).
 * Recalcula todas as composições mas atualiza apenas a estrutura desta planilha.
 */
export async function calcularPlanilhaAtualAction(
  orcamentoId: string,
  planilhaId: string
): Promise<CalculoResult> {
  const supabase = await createClient()
  return executarCalculo(supabase as any, orcamentoId, { modo: 'forca', planilhaId })
}

/**
 * Recalcula completamente todas as planilhas do projeto ignorando delta.
 * Retorna totaisPlanilhas com custo e custo com BDI de cada planilha.
 */
export async function recalcularProjetoAction(
  orcamentoId: string
): Promise<CalculoResult> {
  const supabase = await createClient()
  return executarCalculo(supabase as any, orcamentoId, { modo: 'forca' })
}

/**
 * Verifica a consistência do projeto sem modificar dados.
 */
export async function verificarConsistenciaAction(
  orcamentoId: string
): Promise<ConsistenciaReport> {
  const supabase = await createClient()
  return verificarConsistencia(supabase as any, orcamentoId)
}

/**
 * Detecta composições e insumos órfãos para confirmação do usuário.
 */
export async function detectarOrfaosAction(
  orcamentoId: string
): Promise<OrfaosDetectados> {
  const supabase = await createClient()
  return detectarOrfaos(supabase as any, orcamentoId)
}

/**
 * Remove (soft-delete) os órfãos confirmados pelo usuário.
 * Nunca remove bases nacionais (SINAPI, DNIT, DER, SUDECAP).
 */
export async function confirmarLimpezaAction(
  orcamentoId: string,
  composicaoIds: string[]
): Promise<{ composicoesRemovidas: number; insumosRemovidos: number; ignorados: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const resultado = await executarLimpeza(supabase as any, orcamentoId, composicaoIds, user.id)

  await registrarHistorico(supabase as any, {
    orcamentoId,
    tipo: 'sucesso',
    acao: 'limpeza',
    mensagem: `Limpeza executada: ${resultado.composicoesRemovidas} composição(ões) removida(s), ${resultado.insumosRemovidos} insumo(s), ${resultado.ignorados} ignorado(s) (base nacional).`,
    detalhes: resultado,
  })

  return resultado
}

// ── Ações herdadas para retrocompatibilidade ─────────────────────────────────

/** @deprecated use recalcularProjetoAction */
export async function calcularPlanilhaAction(
  orcamentoId: string,
  planilhaId: string | null
): Promise<CalculoResult> {
  const supabase = await createClient()
  return executarCalculo(supabase as any, orcamentoId, { modo: 'planilha', planilhaId })
}

/** @deprecated use recalcularProjetoAction */
export async function forcaRecalculoAction(
  orcamentoId: string,
  planilhaId: string | null
): Promise<CalculoResult> {
  const supabase = await createClient()
  return executarCalculo(supabase as any, orcamentoId, { modo: 'forca', planilhaId })
}

// ── Planilhas ─────────────────────────────────────────────────────────────────

export async function criarPlanilhaAction(
  orcamentoId: string,
  nome: string,
  bdiGlobal: number
): Promise<OrcamentoPlanilha> {
  const supabase = await createClient()
  return createPlanilha(supabase as any, orcamentoId, nome, bdiGlobal)
}

export async function renomearPlanilhaAction(
  planilhaId: string,
  nome: string
): Promise<OrcamentoPlanilha> {
  const supabase = await createClient()
  return updatePlanilha(supabase as any, planilhaId, { nome })
}

export async function atualizarBdiPlanilhaAction(
  planilhaId: string,
  bdiGlobal: number
): Promise<OrcamentoPlanilha> {
  const supabase = await createClient()
  return updatePlanilha(supabase as any, planilhaId, { bdi_global: bdiGlobal })
}

export async function excluirPlanilhaAction(planilhaId: string): Promise<void> {
  const supabase = await createClient()
  return deletePlanilha(supabase as any, planilhaId)
}

export async function duplicarPlanilhaAction(
  planilhaId: string,
  novoNome: string
): Promise<OrcamentoPlanilha> {
  const supabase = await createClient()
  return duplicatePlanilha(supabase as any, planilhaId, novoNome)
}

export async function inicializarPlanilhaAction(
  orcamentoId: string
): Promise<OrcamentoPlanilha> {
  const supabase = await createClient()
  return getOrCreateDefaultPlanilha(supabase as any, orcamentoId)
}
