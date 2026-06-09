'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface EstruturaItem {
  id: string
  parent_id: string | null
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
}

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

export async function importarEstrutura(
  orcamentoId: string,
  rows: EstruturaRow[]
): Promise<ImportResult> {
  const supabase = await createClient()
  const sb = supabase as any
  const erros: string[] = []

  // Apaga dados existentes
  await sb.from('orcamento_estrutura').delete().eq('orcamento_id', orcamentoId)

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
        orcamento_id: orcamentoId,
        parent_id: parentId,
        numero: r.numero,
        nivel: r.nivel,
        codigo: r.codigo,
        descricao: r.descricao,
        unidade: r.unidade,
        quantidade: r.quantidade,
        custo_unitario: r.custo_unitario,
        tipo: r.tipo,
        ordem: r.ordem,
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

  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  return { ok: idMap.size, erros }
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
  await sb.from('orcamento_estrutura').update(fields).eq('id', id)
  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
}

export async function deletarItemEstrutura(
  id: string,
  orcamentoId: string
): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any
  await sb.from('orcamento_estrutura').delete().eq('id', id)
  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
}

export async function salvarNumeros(
  orcamentoId: string,
  updates: { id: string; numero: string; nivel: number }[]
): Promise<void> {
  if (updates.length === 0) return
  const supabase = await createClient()
  const sb = supabase as any
  const BATCH = 50
  for (let i = 0; i < updates.length; i += BATCH) {
    await Promise.all(
      updates.slice(i, i + BATCH).map(u =>
        sb.from('orcamento_estrutura').update({ numero: u.numero, nivel: u.nivel }).eq('id', u.id)
      )
    )
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

export async function limparPlanilha(orcamentoId: string): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any
  await sb.from('orcamento_estrutura').delete().eq('orcamento_id', orcamentoId)
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
): Promise<EstruturaItem> {
  const supabase = await createClient()
  const sb = supabase as any

  const { data: ref } = await sb
    .from('orcamento_estrutura')
    .select('parent_id, nivel, ordem')
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

  for (const sib of siblings ?? []) {
    await sb.from('orcamento_estrutura').update({ ordem: sib.ordem + 1 }).eq('id', sib.id)
  }

  const { data } = await sb.from('orcamento_estrutura')
    .insert({
      orcamento_id: orcamentoId,
      parent_id: ref.parent_id,
      numero: '',
      nivel: ref.nivel,
      codigo: null,
      descricao: 'Novo item',
      unidade: null,
      quantidade: null,
      custo_unitario: null,
      bdi_especifico: null,
      tipo: 'item',
      ordem: insertOrdem,
    })
    .select('id, parent_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem')
    .single()

  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  return data as EstruturaItem
}

export async function adicionarItemEstrutura(
  orcamentoId: string,
  parentId: string | null,
  parentNivel: number,
  row: { codigo: string | null; descricao: string; unidade: string | null; quantidade: number | null; custo_unitario: number | null; tipo: 'grupo' | 'item'; numero: string }
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
      orcamento_id: orcamentoId,
      parent_id: parentId,
      numero: row.numero,
      nivel: parentNivel + 1,
      codigo: row.codigo,
      descricao: row.descricao,
      unidade: row.unidade,
      quantidade: row.quantidade,
      custo_unitario: row.custo_unitario,
      bdi_especifico: null,
      tipo: row.tipo,
      ordem: nextOrdem,
    })
    .select('id, parent_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem')

  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  return data[0] as EstruturaItem
}
