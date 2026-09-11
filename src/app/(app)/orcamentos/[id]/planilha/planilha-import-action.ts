'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { registrarHistorico } from '@/lib/log'
import { persistirTotaisPlanilha } from '@/lib/orcamento/motor-calculo'
import { normNum } from '@/lib/orcamento/planilha-excel-parser'
import { fetchAllPaginatedParallel } from '@/lib/orcamento/paginate'

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

/**
 * Adiciona SÓ os itens que a Conferência de Importação marcou como "ausente"
 * — nunca apaga, nunca sobrescreve o que já existe (ao contrário de
 * importarEstrutura, que substitui a planilha inteira). Pensado pra ser
 * chamado com exatamente as linhas ausentes (ver conferencia-importacao.ts,
 * status 'ausente'), não a planilha inteira de novo.
 *
 * Resolve parent_id em 2 fontes: itens que já existiam antes desta correção
 * (idMap pré-carregado) e itens ausentes irmãos que estão sendo inseridos
 * na mesma chamada (idMap crescendo a cada nível, igual importarEstrutura) —
 * cobre o caso de uma subárvore inteira estar faltando, não só folhas soltas.
 * Se o pai de um item ausente não existir em nenhuma das duas fontes, o item
 * é pulado (nunca insere com parent_id incorreto/órfão) e reportado em erros.
 */
export async function adicionarItensAusentes(
  orcamentoId: string,
  rows: EstruturaRow[],
  planilhaId?: string | null
): Promise<ImportResult> {
  const supabase = await createClient()
  const sb = supabase as any
  const erros: string[] = []
  if (rows.length === 0) return { ok: 0, erros: [] }

  // fetchAllPaginatedParallel (não um select() solto): sem paginar, o
  // PostgREST corta a resposta em 1000 linhas por padrão — num orçamento com
  // mais de 1000 itens na planilha, uns 70+ ficariam invisíveis pra este
  // idMap, e o item ausente cujo pai calhasse de estar fora dessa primeira
  // leva seria erroneamente reportado como "pai não encontrado" mesmo o pai
  // existindo de verdade (achado ao vivo no Edifício Oásis, 1073 itens).
  let existentes: { id: string; numero: string; parent_id: string | null; ordem: number }[]
  try {
    existentes = await fetchAllPaginatedParallel<{ id: string; numero: string; parent_id: string | null; ordem: number }>(
      (from, to) => {
        let q = sb.from('orcamento_estrutura').select('id, numero, parent_id, ordem', { count: 'exact' }).eq('orcamento_id', orcamentoId)
        if (planilhaId) q = q.eq('planilha_id', planilhaId)
        return q.range(from, to)
      }
    )
  } catch (e) {
    return { ok: 0, erros: [`Erro ao ler a planilha atual: ${e instanceof Error ? e.message : String(e)}`] }
  }

  const idMap = new Map<string, string>(existentes.map((r) => [normNum(r.numero), r.id]))

  // Maior `ordem` já usada em cada grupo de irmãos — itens novos entram no
  // FINAL do grupo, nunca no meio. A `ordem` de uma importação anterior não
  // é comparável posição-a-posição com a deste arquivo (contadores
  // independentes), então intercalar seria arriscado; anexar no final é
  // sempre seguro e só afeta a posição visual, nunca o valor calculado.
  const maxOrdemPorPai = new Map<string, number>()
  for (const r of existentes ?? []) {
    const chave = r.parent_id ?? '__root__'
    maxOrdemPorPai.set(chave, Math.max(maxOrdemPorPai.get(chave) ?? -1, r.ordem ?? -1))
  }

  const byLevel = new Map<number, EstruturaRow[]>()
  for (const r of rows) {
    if (!byLevel.has(r.nivel)) byLevel.set(r.nivel, [])
    byLevel.get(r.nivel)!.push(r)
  }
  const maxLevel = Math.max(...Array.from(byLevel.keys()))

  let sucesso = 0
  for (let lvl = 1; lvl <= maxLevel; lvl++) {
    const levelRows = byLevel.get(lvl) ?? []
    if (levelRows.length === 0) continue

    const toInsert: Record<string, unknown>[] = []
    for (const r of levelRows) {
      const norm = normNum(r.numero)
      if (idMap.has(norm)) continue // já existe — evita duplicar se rodado 2x
      const parentNormKey = parentNorm(norm)
      const parentId = parentNormKey ? (idMap.get(parentNormKey) ?? null) : null
      if (parentNormKey && !parentId) {
        erros.push(`Item ${r.numero} (${r.descricao.slice(0, 40)}): pai "${parentNormKey}" não encontrado na planilha — não adicionado, para não ficar órfão. Adicione o pai primeiro.`)
        continue
      }
      const chavePai = parentId ?? '__root__'
      const novaOrdem = (maxOrdemPorPai.get(chavePai) ?? -1) + 1
      maxOrdemPorPai.set(chavePai, novaOrdem)
      toInsert.push({
        orcamento_id: orcamentoId, planilha_id: planilhaId ?? null, parent_id: parentId,
        numero: r.numero, nivel: r.nivel, codigo: r.codigo, descricao: r.descricao,
        unidade: r.unidade, quantidade: r.quantidade, custo_unitario: r.custo_unitario,
        tipo: r.tipo, ordem: novaOrdem,
      })
    }
    if (toInsert.length === 0) continue

    const BATCH = 100
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const lote = toInsert.slice(i, i + BATCH)
      const { data, error } = await sb.from('orcamento_estrutura').insert(lote).select('id, numero')
      if (error) {
        erros.push(error.message)
      } else {
        for (const row of (data ?? [])) { idMap.set(normNum(row.numero), row.id); sucesso++ }
      }
    }
  }

  if (sucesso > 0) {
    const planilhaIdsParaRecalcular = planilhaId
      ? [planilhaId]
      : ((await sb.from('orcamento_planilhas').select('id').eq('orcamento_id', orcamentoId)).data ?? []).map((p: { id: string }) => p.id)
    await persistirTotaisPlanilha(supabase, orcamentoId, planilhaIdsParaRecalcular).catch(console.error)
    revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  }

  registrarHistorico(supabase, {
    orcamentoId,
    planilhaId,
    entidade: 'planilha',
    tipo: erros.length > 0 && sucesso === 0 ? 'erro' : erros.length > 0 ? 'info' : 'sucesso',
    acao: 'adicionar_itens_ausentes',
    mensagem: `Conferência de Importação: ${sucesso} item(ns) ausente(s) adicionado(s)${erros.length > 0 ? `, ${erros.length} não adicionado(s)` : ''}`,
    detalhes: { solicitados: rows.length, adicionados: sucesso, erros },
  }).catch(console.error)

  return { ok: sucesso, erros }
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

  // fetchAllPaginatedParallel (não um select() solto): sem paginar, o
  // PostgREST corta a resposta em 1000 linhas por padrão. Com o orçamento
  // acima de 1000 itens, isso fazia itens que JÁ EXISTIAM (fora das
  // primeiras 1000 linhas) sumirem desta lista e serem reportados como
  // "ausente" pela Conferência — falso positivo, não item faltando de
  // verdade (bug real encontrado ao vivo no Edifício Oásis: 53 "ausentes"
  // que na verdade já estavam todos na planilha).
  try {
    const data = await fetchAllPaginatedParallel<EstruturaAtualRow>((from, to) => {
      let q = sb
        .from('orcamento_estrutura')
        .select('id, numero, descricao, unidade, quantidade, nivel, ordem', { count: 'exact' })
        .eq('orcamento_id', orcamentoId)
      if (planilhaId) q = q.eq('planilha_id', planilhaId)
      return q.range(from, to)
    })
    return data.sort((a, b) => a.nivel - b.nivel || a.ordem - b.ordem)
  } catch (e) {
    throw new Error(`Erro ao buscar estrutura atual: ${e instanceof Error ? e.message : String(e)}`)
  }
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
