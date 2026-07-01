import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrcamentoPlanilha } from './types'

const TABLE = 'orcamento_planilhas'

export async function getPlanilhasByOrcamento(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<OrcamentoPlanilha[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('orcamento_id', orcamentoId)
    .order('ordem')
  if (error) throw new Error(`Erro ao buscar planilhas: ${error.message}`)
  return data as OrcamentoPlanilha[]
}

export async function createPlanilha(
  supabase: SupabaseClient,
  orcamentoId: string,
  nome: string,
  bdiGlobal = 0
): Promise<OrcamentoPlanilha> {
  const { data: last } = await supabase
    .from(TABLE)
    .select('ordem')
    .eq('orcamento_id', orcamentoId)
    .order('ordem', { ascending: false })
    .limit(1)
  const nextOrdem = ((last?.[0] as any)?.ordem ?? -1) + 1

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ orcamento_id: orcamentoId, nome, bdi_global: bdiGlobal, ordem: nextOrdem })
    .select()
    .single()
  if (error) throw new Error(`Erro ao criar planilha: ${error.message}`)
  return data as OrcamentoPlanilha
}

export async function updatePlanilha(
  supabase: SupabaseClient,
  planilhaId: string,
  fields: Partial<Pick<OrcamentoPlanilha, 'nome' | 'bdi_global'>>
): Promise<OrcamentoPlanilha> {
  const { data, error } = await supabase
    .from(TABLE)
    .update(fields)
    .eq('id', planilhaId)
    .select()
    .single()
  if (error) throw new Error(`Erro ao atualizar planilha: ${error.message}`)
  return data as OrcamentoPlanilha
}

export async function deletePlanilha(
  supabase: SupabaseClient,
  planilhaId: string
): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', planilhaId)
  if (error) throw new Error(`Erro ao excluir planilha: ${error.message}`)
}

export async function duplicatePlanilha(
  supabase: SupabaseClient,
  planilhaId: string,
  novoNome: string
): Promise<OrcamentoPlanilha> {
  const { data: orig, error: origErr } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', planilhaId)
    .single()
  if (origErr) throw new Error(`Planilha não encontrada: ${origErr.message}`)
  const original = orig as OrcamentoPlanilha

  const nova = await createPlanilha(supabase, original.orcamento_id, novoNome, original.bdi_global)

  // Clonar itens por nível para manter integridade de parent_id
  const { data: itens, error: itensErr } = await supabase
    .from('orcamento_estrutura')
    .select('*')
    .eq('planilha_id', planilhaId)
    .order('nivel', { ascending: true })
    .order('ordem', { ascending: true })
  if (itensErr) throw new Error(`Erro ao buscar itens: ${itensErr.message}`)
  if (!itens || itens.length === 0) return nova

  const idMap = new Map<string, string>()
  const byLevel = new Map<number, typeof itens>()
  for (const it of itens) {
    const n = it.nivel ?? 1
    if (!byLevel.has(n)) byLevel.set(n, [])
    byLevel.get(n)!.push(it)
  }

  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    const levelItems = byLevel.get(level)!
    const rows = levelItems.map(it => ({
      orcamento_id:  it.orcamento_id,
      planilha_id:   nova.id,
      parent_id:     it.parent_id ? (idMap.get(it.parent_id) ?? null) : null,
      numero:        it.numero,
      nivel:         it.nivel,
      codigo:        it.codigo,
      descricao:     it.descricao,
      unidade:       it.unidade,
      quantidade:    it.quantidade,
      custo_unitario: it.custo_unitario,
      bdi_especifico: it.bdi_especifico,
      tipo:          it.tipo,
      ordem:         it.ordem,
    }))

    const { data: inserted, error: insertErr } = await supabase
      .from('orcamento_estrutura')
      .insert(rows)
      .select('id')
    if (insertErr) throw new Error(`Erro ao duplicar itens: ${insertErr.message}`)
    levelItems.forEach((orig, idx) => idMap.set(orig.id, (inserted as any[])[idx].id))
  }

  return nova
}

/**
 * Garante que o orçamento tenha ao menos uma planilha.
 * Se não houver nenhuma, cria "Planilha Principal" e vincula todos os itens
 * existentes sem planilha_id (retrocompatibilidade).
 */
export async function getOrCreateDefaultPlanilha(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<OrcamentoPlanilha> {
  const existentes = await getPlanilhasByOrcamento(supabase, orcamentoId)
  if (existentes.length > 0) return existentes[0]

  const { data: orc } = await supabase
    .from('tabela_orcamentos')
    .select('bdi_global')
    .eq('id', orcamentoId)
    .single()

  const planilha = await createPlanilha(
    supabase,
    orcamentoId,
    'Planilha Principal',
    (orc as any)?.bdi_global ?? 0
  )

  // Vincula itens legados (sem planilha_id) à planilha recém-criada
  await supabase
    .from('orcamento_estrutura')
    .update({ planilha_id: planilha.id })
    .eq('orcamento_id', orcamentoId)
    .is('planilha_id', null)

  return planilha
}
