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
  fields: { quantidade?: number; custo_unitario?: number; descricao?: string }
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
  if (!query) return []
  const supabase = await createClient()
  const sb = supabase as any
  const [{ data: insumos }, { data: composicoes }] = await Promise.all([
    sb.from('orcamento_insumos')
      .select('codigo, descricao, unidade, custo')
      .eq('orcamento_id', orcamentoId)
      .or(`codigo.ilike.%${query}%,descricao.ilike.%${query}%`)
      .limit(10),
    sb.from('orcamento_composicoes')
      .select('codigo, descricao, unidade')
      .eq('orcamento_id', orcamentoId)
      .or(`codigo.ilike.%${query}%,descricao.ilike.%${query}%`)
      .limit(10),
  ])
  const result: SugestaoCodigo[] = [
    ...(insumos ?? []).map((i: any) => ({
      codigo: i.codigo, descricao: i.descricao, unidade: i.unidade,
      custo_unitario: i.custo, fonte: 'insumo' as const,
    })),
    ...(composicoes ?? []).map((c: any) => ({
      codigo: c.codigo, descricao: c.descricao, unidade: c.unidade,
      custo_unitario: null, fonte: 'composicao' as const,
    })),
  ]
  return result.sort((a, b) => a.codigo.localeCompare(b.codigo)).slice(0, 15)
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
      tipo: row.tipo,
      ordem: nextOrdem,
    })
    .select('id, parent_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, tipo, ordem')

  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  return data[0] as EstruturaItem
}
