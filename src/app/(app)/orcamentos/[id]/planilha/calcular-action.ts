'use server'

import { createClient } from '@/lib/supabase/server'
import { executarCalculo } from '@/lib/orcamento/motor-calculo'
import { createPlanilha, deletePlanilha, updatePlanilha, duplicatePlanilha, getOrCreateDefaultPlanilha } from '@/lib/orcamento/planilhas'
import type { CalculoResult } from '@/lib/orcamento/motor-calculo'
import type { OrcamentoPlanilha } from '@/lib/orcamento/types'

export async function calcularPlanilhaAction(
  orcamentoId: string,
  planilhaId: string | null
): Promise<CalculoResult> {
  const supabase = await createClient()
  return executarCalculo(supabase as any, orcamentoId, planilhaId)
}

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
