'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { registrarHistorico } from '@/lib/log'
import { persistirTotaisPlanilha } from '@/lib/orcamento/motor-calculo'

export interface EstruturaRow {
  numero: string
  nivel: number
  codigo: string | null
  descricao: string
  unidade: string | null
  quantidade: number | null
  custo_unitario: number | null
  tipo: 'grupo' | 'item'
  ordem: number
}

export interface ImportResult {
  ok: number
  erros: string[]
}

// Normaliza o número do item removendo zeros à esquerda de cada segmento
function normNum(n: string): string {
  return n.split('.').map(s => parseInt(s, 10).toString()).join('.')
}

// Retorna o número pai (remove último segmento)
function parentNorm(n: string): string | null {
  const parts = n.split('.')
  if (parts.length <= 1) return null
  return parts.slice(0, -1).join('.')
}

export async function validarComposicoes(
  orcamentoId: string,
  codigos: string[]
): Promise<string[]> {
  if (codigos.length === 0) return []
  const supabase = await createClient()
  const sb = supabase as any
  const { data } = await sb
    .from('orcamento_composicoes')
    .select('codigo')
    .eq('orcamento_id', orcamentoId)
    .in('codigo', codigos)
  const validos = new Set<string>((data ?? []).map((r: any) => r.codigo))
  return codigos.filter(c => !validos.has(c))
}

export async function importarEstrutura(
  orcamentoId: string,
  rows: EstruturaRow[],
  planilhaId?: string | null
): Promise<ImportResult> {
  const supabase = await createClient()
  const sb = supabase as any
  const erros: string[] = []

  // Apaga dados existentes da planilha (ou do orçamento inteiro se sem planilha)
  const delQ = planilhaId
    ? sb.from('orcamento_estrutura').delete().eq('planilha_id', planilhaId)
    : sb.from('orcamento_estrutura').delete().eq('orcamento_id', orcamentoId)

  await delQ
  if (rows.length === 0) return { ok: 0, erros: [] }

  // Insere nível por nível para garantir parent_ids corretos
  // Map: normNum → db id
  const idMap = new Map<string, string>()

  const byLevel = new Map<number, EstruturaRow[]>()
  for (const r of rows) {
    const lvl = r.nivel
    if (!byLevel.has(lvl)) byLevel.set(lvl, [])
    byLevel.get(lvl)!.push(r)
  }

  const maxLevel = Math.max(...Array.from(byLevel.keys()))

  for (let lvl = 1; lvl <= maxLevel; lvl++) {
    const levelRows = byLevel.get(lvl) ?? []
    if (levelRows.length === 0) continue

    const toInsert = levelRows.map(r => {
      const norm = normNum(r.numero)
      const parentNormKey = parentNorm(norm)
      const parentId = parentNormKey ? (idMap.get(parentNormKey) ?? null) : null

      return {
        orcamento_id:  orcamentoId,
        planilha_id:   planilhaId ?? null,
        parent_id:     parentId,
        numero:        r.numero,
        nivel:         r.nivel,
        codigo:        r.codigo,
        descricao:     r.descricao,
        unidade:       r.unidade,
        quantidade:    r.quantidade,
        custo_unitario: r.custo_unitario,
        tipo:          r.tipo,
        ordem:         r.ordem,
      }
    })

    const BATCH = 100
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const lote = toInsert.slice(i, i + BATCH)
      const { data, error } = await sb
        .from('orcamento_estrutura')
        .insert(lote)
        .select('id, numero')

      if (error) {
        erros.push(error.message)
      } else {
        for (const row of (data ?? [])) {
          idMap.set(normNum(row.numero), row.id)
        }
      }
    }
  }

  const planilhaIdsParaRecalcular = planilhaId
    ? [planilhaId]
    : ((await sb.from('orcamento_planilhas').select('id').eq('orcamento_id', orcamentoId)).data ?? []).map((p: { id: string }) => p.id)
  await persistirTotaisPlanilha(supabase, orcamentoId, planilhaIdsParaRecalcular).catch(console.error)

  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)

  registrarHistorico(supabase, {
    orcamentoId,
    entidade: 'planilha',
    tipo: erros.length > 0 ? 'info' : 'sucesso',
    acao: 'importar_planilha',
    mensagem: `Planilha importada: ${idMap.size} itens${erros.length > 0 ? `, ${erros.length} erros` : ''}`,
    detalhes: { total: idMap.size, erros: erros.length },
  }).catch(console.error)

  return { ok: idMap.size, erros }
}

export interface EstruturaAtualRow {
  id: string
  numero: string
  descricao: string
  unidade: string | null
  quantidade: number | null
  nivel: number
  ordem: number
}

/**
 * Estrutura atual do orçamento/planilha, no formato que a Conferência de
 * Importação precisa pra comparar contra um Excel reenviado — ver
 * compararComExcel em conferencia-importacao.ts. Só leitura, nada é
 * alterado; nenhum dado do Excel é persistido por essa tela.
 */
export async function buscarEstruturaParaConferencia(
  orcamentoId: string,
  planilhaId?: string | null
): Promise<EstruturaAtualRow[]> {
  const supabase = await createClient()
  const sb = supabase as any

  let query = sb
    .from('orcamento_estrutura')
    .select('id, numero, descricao, unidade, quantidade, nivel, ordem')
    .eq('orcamento_id', orcamentoId)
  if (planilhaId) query = query.eq('planilha_id', planilhaId)

  const { data, error } = await query.order('nivel', { ascending: true }).order('ordem', { ascending: true })
  if (error) throw new Error(`Erro ao buscar estrutura atual: ${error.message}`)
  return (data ?? []) as EstruturaAtualRow[]
}

export async function limparPlanilha(
  orcamentoId: string,
  planilhaId?: string | null
): Promise<{ removidos: number }> {
  const supabase = await createClient()
  const sb = supabase as any

  const selectQ = planilhaId
    ? sb.from('orcamento_estrutura').select('*').eq('planilha_id', planilhaId)
    : sb.from('orcamento_estrutura').select('*').eq('orcamento_id', orcamentoId)
  const { data: itensApagados } = await selectQ

  const deleteQ = planilhaId
    ? sb.from('orcamento_estrutura').delete({ count: 'exact' }).eq('planilha_id', planilhaId)
    : sb.from('orcamento_estrutura').delete({ count: 'exact' }).eq('orcamento_id', orcamentoId)
  const { error, count } = await deleteQ

  if (error) throw new Error(`Erro ao limpar planilha: ${error.message}`)
  if ((itensApagados?.length ?? 0) > 0 && !count) {
    throw new Error('Nenhum item foi removido no banco de dados (0 linhas afetadas). Os dados não foram alterados.')
  }

  const planilhaIdsParaRecalcular = planilhaId
    ? [planilhaId]
    : ((await sb.from('orcamento_planilhas').select('id').eq('orcamento_id', orcamentoId)).data ?? []).map((p: { id: string }) => p.id)
  await persistirTotaisPlanilha(supabase, orcamentoId, planilhaIdsParaRecalcular).catch(console.error)

  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  registrarHistorico(supabase, {
    orcamentoId,
    planilhaId,
    entidade: 'planilha',
    tipo: 'info',
    acao: 'limpar_planilha',
    mensagem: `Planilha limpa (${count ?? 0} item(ns) removido(s))`,
    detalhes: { itens_apagados: itensApagados ?? [] },
  }).catch(console.error)
  return { removidos: count ?? 0 }
}
