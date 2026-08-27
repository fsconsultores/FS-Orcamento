'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { persistirTotaisPlanilha } from '@/lib/orcamento/motor-calculo'

export interface EstruturaItem {
  id: string
  parent_id: string | null
  planilha_id: string | null
  numero: string
  nivel: number
  codigo: string | null
  descricao: string
  unidade: string | null
  quantidade: number | null
  custo_unitario: number | null
  bdi_especifico: number | null
  tipo: 'grupo' | 'item'
  ordem: number
  /** Marca o item auto-gerenciado "Taxa de Administração" de uma planilha —
   * ver src/lib/orcamento/modelo-acrescimo.ts. Opcional pra não exigir esse
   * campo em todo lugar que já constrói um EstruturaItem hoje. */
  eh_taxa_administracao?: boolean
}

export async function buscarItensEstrutura(
  orcamentoId: string,
  planilhaId?: string | null
): Promise<EstruturaItem[]> {
  const supabase = await createClient()
  const sb = supabase as any
  let q = sb
    .from('orcamento_estrutura')
    .select('id, parent_id, planilha_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem, eh_taxa_administracao')
    .eq('orcamento_id', orcamentoId)
    .order('nivel', { ascending: true })
    .order('ordem', { ascending: true })
  if (planilhaId) q = q.eq('planilha_id', planilhaId)
  const { data } = await q
  return data ?? []
}

export async function atualizarItemEstrutura(
  id: string,
  orcamentoId: string,
  fields: {
    numero?: string
    codigo?: string | null
    descricao?: string
    unidade?: string | null
    quantidade?: number | null
    custo_unitario?: number | null
    bdi_especifico?: number | null
    ordem?: number
  }
): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any
  const { data } = await sb.from('orcamento_estrutura').update(fields).eq('id', id).select('planilha_id').single()
  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)

  const afetaTotal = 'quantidade' in fields || 'custo_unitario' in fields || 'bdi_especifico' in fields
  if (afetaTotal && data?.planilha_id) {
    await persistirTotaisPlanilha(supabase, orcamentoId, [data.planilha_id]).catch(console.error)
  }
}

export async function deletarItemEstrutura(
  id: string,
  orcamentoId: string
): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any
  const { data } = await sb.from('orcamento_estrutura').select('planilha_id').eq('id', id).single()
  await sb.from('orcamento_estrutura').delete().eq('id', id)
  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)

  if (data?.planilha_id) {
    await persistirTotaisPlanilha(supabase, orcamentoId, [data.planilha_id]).catch(console.error)
  }
}

// Descarta operações estruturais (adicionar/excluir/mover) feitas desde o
// último "Salvar Planilha"/"Calcular" — essas operações já persistem no banco
// na hora do clique (diferente das edições de célula, que ficam em
// dirtyItemsRef até o Salvar), então "Sair sem salvar" sozinho não tinha como
// revertê-las. Restaura a planilha ativa para o snapshot capturado no último
// ponto confirmado, apagando e reinserindo nível a nível — mesmo padrão de
// restaurarEstrutura() em versoes/versoes-action.ts (evita violar a FK
// parent_id ao inserir um filho antes do pai existir), só que escopado a uma
// única planilha e sem remapear planilha_id (não atravessa planilhas).
export async function restaurarEstruturaSnapshot(
  orcamentoId: string,
  planilhaId: string | null,
  snapshot: EstruturaItem[]
): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any

  const delQ = planilhaId
    ? sb.from('orcamento_estrutura').delete().eq('orcamento_id', orcamentoId).eq('planilha_id', planilhaId)
    : sb.from('orcamento_estrutura').delete().eq('orcamento_id', orcamentoId).is('planilha_id', null)
  const { error: delErr } = await delQ
  if (delErr) throw new Error(`Erro ao descartar alterações: ${delErr.message}`)

  if (snapshot.length > 0) {
    const idMap = new Map<string, string>()
    const byNivel = new Map<number, EstruturaItem[]>()
    for (const it of snapshot) {
      const arr = byNivel.get(it.nivel) ?? []
      arr.push(it)
      byNivel.set(it.nivel, arr)
    }

    for (const nivel of [...byNivel.keys()].sort((a, b) => a - b)) {
      const itens = byNivel.get(nivel)!
      const rows = itens.map(it => ({
        orcamento_id: orcamentoId,
        planilha_id: planilhaId,
        parent_id: it.parent_id ? (idMap.get(it.parent_id) ?? null) : null,
        numero: it.numero,
        nivel: it.nivel,
        codigo: it.codigo,
        descricao: it.descricao,
        unidade: it.unidade,
        quantidade: it.quantidade,
        custo_unitario: it.custo_unitario,
        bdi_especifico: it.bdi_especifico,
        tipo: it.tipo,
        ordem: it.ordem,
        eh_taxa_administracao: it.eh_taxa_administracao ?? false,
      }))
      const { data: inserted, error } = await sb.from('orcamento_estrutura').insert(rows).select('id')
      if (error) throw new Error(`Erro ao descartar alterações (nível ${nivel}): ${error.message}`)
      itens.forEach((it, i) => idMap.set(it.id, inserted[i].id))
    }
  }

  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  if (planilhaId) {
    await persistirTotaisPlanilha(supabase, orcamentoId, [planilhaId]).catch(console.error)
  }
}

export async function moverItem(
  orcamentoId: string,
  itemId: string,
  newParentId: string | null,
  novaOrdem: number
): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any
  let newNivel = 1
  if (newParentId) {
    const { data: parent } = await sb
      .from('orcamento_estrutura').select('nivel').eq('id', newParentId).single()
    if (parent) newNivel = parent.nivel + 1
  }
  await sb.from('orcamento_estrutura')
    .update({ parent_id: newParentId, nivel: newNivel, ordem: novaOrdem })
    .eq('id', itemId)
  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
}

export interface SugestaoCodigo {
  codigo: string
  descricao: string
  unidade: string
  custo_unitario: number | null
  fonte: 'insumo' | 'composicao'
}

export async function buscarSugestoesCodigo(
  orcamentoId: string,
  query: string
): Promise<SugestaoCodigo[]> {
  const supabase = await createClient()
  const sb = supabase as any
  const t = query.trim()

  // 1. Composições do orçamento
  const compQ = t
    ? sb.from('orcamento_composicoes').select('id, codigo, descricao, unidade')
        .eq('orcamento_id', orcamentoId)
        .or(`codigo.ilike.%${t}%,descricao.ilike.%${t}%`)
        .order('codigo').limit(15)
    : sb.from('orcamento_composicoes').select('id, codigo, descricao, unidade')
        .eq('orcamento_id', orcamentoId)
        .order('codigo').limit(15)

  const { data: comps } = await compQ
  if (!comps?.length) return []

  const ids = comps.map((c: any) => c.id)

  // 2 + 3 em paralelo: insumos das composições + avulsos do orçamento
  const [{ data: allIns }, { data: avulsos }] = await Promise.all([
    sb.from('orcamento_insumos')
      .select('composicao_id, codigo, custo, indice')
      .in('composicao_id', ids),
    sb.from('orcamento_insumos')
      .select('codigo, custo')
      .eq('orcamento_id', orcamentoId)
      .is('composicao_id', null),
  ])

  const precoMap = new Map<string, number>()
  for (const av of avulsos ?? []) precoMap.set(av.codigo, av.custo ?? 0)

  // 4. Passo 1: calcula com avulsos
  const custoMap: Record<string, number> = {}
  for (const ins of allIns ?? []) {
    if (!ins.composicao_id) continue
    const preco = precoMap.has(ins.codigo) ? precoMap.get(ins.codigo)! : (ins.custo ?? 0)
    custoMap[ins.composicao_id] = (custoMap[ins.composicao_id] ?? 0) + preco * (ins.indice ?? 1)
  }

  // 5. Enriquece precoMap com composições filhas calculadas
  for (const c of comps) {
    if (!precoMap.has(c.codigo) && custoMap[c.id] !== undefined)
      precoMap.set(c.codigo, custoMap[c.id])
  }

  // 6. Passo 2: recalcula com precoMap completo (avulsos + composições filhas)
  const custoFinal: Record<string, number> = {}
  for (const ins of allIns ?? []) {
    if (!ins.composicao_id) continue
    const preco = precoMap.has(ins.codigo) ? precoMap.get(ins.codigo)! : (ins.custo ?? 0)
    custoFinal[ins.composicao_id] = (custoFinal[ins.composicao_id] ?? 0) + preco * (ins.indice ?? 1)
  }

  return comps.map((c: any) => ({
    codigo: c.codigo,
    descricao: c.descricao,
    unidade: c.unidade,
    custo_unitario: custoFinal[c.id] || null, // null se 0 (preços não cadastrados)
    fonte: 'composicao' as const,
  }))
}

export async function adicionarItemNaPosicao(
  orcamentoId: string,
  referenceId: string,
  position: 'above' | 'below',
  planilhaId?: string | null
): Promise<EstruturaItem> {
  const supabase = await createClient()
  const sb = supabase as any

  const { data: ref } = await sb
    .from('orcamento_estrutura')
    .select('parent_id, planilha_id, nivel, ordem')
    .eq('id', referenceId)
    .single()

  if (!ref) throw new Error('Item referência não encontrado')

  const insertOrdem = position === 'above' ? ref.ordem : ref.ordem + 1

  // Busca irmãos que precisam ser deslocados
  let sibQ = sb.from('orcamento_estrutura')
    .select('id, ordem')
    .eq('orcamento_id', orcamentoId)
    .gte('ordem', insertOrdem)
  sibQ = ref.parent_id
    ? sibQ.eq('parent_id', ref.parent_id)
    : sibQ.is('parent_id', null)

  const { data: siblings } = await sibQ

  if ((siblings ?? []).length > 0) {
    await Promise.all(
      (siblings as { id: string; ordem: number }[]).map(sib =>
        sb.from('orcamento_estrutura').update({ ordem: sib.ordem + 1 }).eq('id', sib.id)
      )
    )
  }

  const { data } = await sb.from('orcamento_estrutura')
    .insert({
      orcamento_id:  orcamentoId,
      planilha_id:   planilhaId ?? ref.planilha_id ?? null,
      parent_id:     ref.parent_id,
      numero:        '',
      nivel:         ref.nivel,
      codigo:        null,
      descricao:     'Novo item',
      unidade:       null,
      quantidade:    null,
      custo_unitario: null,
      bdi_especifico: null,
      tipo:          'item',
      ordem:         insertOrdem,
    })
    .select('id, parent_id, planilha_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem')
    .single()

  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  if (data?.planilha_id) {
    await persistirTotaisPlanilha(supabase, orcamentoId, [data.planilha_id]).catch(console.error)
  }
  return data as EstruturaItem
}

export async function adicionarItemEstrutura(
  orcamentoId: string,
  parentId: string | null,
  parentNivel: number,
  row: { codigo: string | null; descricao: string; unidade: string | null; quantidade: number | null; custo_unitario: number | null; tipo: 'grupo' | 'item'; numero: string },
  planilhaId?: string | null
): Promise<EstruturaItem> {
  const supabase = await createClient()
  const sb = supabase as any

  const { data: siblings } = await sb
    .from('orcamento_estrutura')
    .select('ordem')
    .eq('orcamento_id', orcamentoId)
    .eq('parent_id', parentId ?? null)
    .order('ordem', { ascending: false })
    .limit(1)

  const nextOrdem = siblings?.[0]?.ordem != null ? siblings[0].ordem + 1 : 0

  const { data } = await sb.from('orcamento_estrutura')
    .insert({
      orcamento_id:  orcamentoId,
      planilha_id:   planilhaId ?? null,
      parent_id:     parentId,
      numero:        row.numero,
      nivel:         parentNivel + 1,
      codigo:        row.codigo,
      descricao:     row.descricao,
      unidade:       row.unidade,
      quantidade:    row.quantidade,
      custo_unitario: row.custo_unitario,
      bdi_especifico: null,
      tipo:          row.tipo,
      ordem:         nextOrdem,
    })
    .select('id, parent_id, planilha_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem')

  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  if (data?.[0]?.planilha_id) {
    await persistirTotaisPlanilha(supabase, orcamentoId, [data[0].planilha_id]).catch(console.error)
  }
  return data[0] as EstruturaItem
}
