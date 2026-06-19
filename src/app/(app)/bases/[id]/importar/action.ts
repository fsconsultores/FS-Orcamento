'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ImportInsumoRow, ImportComposicaoRow, ImportResult } from '@/app/(app)/orcamentos/[id]/importar/import-action'

export async function getBaseInfo(baseId: string) {
  const supabase = await createClient()
  const sb = supabase as any
  const { data } = await sb.from('tabela_bases').select('id, orgao, tipo_base').eq('id', baseId).single()
  return data as { id: string; orgao: string; tipo_base: string } | null
}

// Importa insumos para tabela_insumos (base global)
export async function importarInsumosParaBase(
  baseId: string,
  rows: ImportInsumoRow[]
): Promise<ImportResult> {
  const supabase = await createClient()
  const sb = supabase as any
  const result: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [] }

  // Apaga os existentes com o mesmo código nesta base e reinserve (mantém preços atualizados)
  const allCodigos = rows.map(r => r.codigo).filter(Boolean)
  await Promise.all(
    Array.from({ length: Math.ceil(allCodigos.length / 500) }, (_, i) =>
      sb.from('tabela_insumos').delete().eq('base_id', baseId).in('codigo', allCodigos.slice(i * 500, (i + 1) * 500))
    )
  )

  const insRows = rows.map(r => ({
    codigo: r.codigo,
    descricao: r.descricao,
    unidade: r.unidade,
    preco_base: r.custo,
    grupo: r.grupo,
    fonte: r.base,
    data_referencia: r.data_ref,
    base_id: baseId,
  }))

  const lotes = Array.from({ length: Math.ceil(insRows.length / 500) }, (_, i) => insRows.slice(i * 500, (i + 1) * 500))
  const insertResults = await Promise.all(lotes.map(lote => sb.from('tabela_insumos').insert(lote)))
  for (let i = 0; i < insertResults.length; i++) {
    const { error } = insertResults[i]
    if (error) result.erros.push(`Insumos: ${error.message}`)
    else result.insumosCriados += lotes[i].length
  }

  revalidatePath('/bases')
  revalidateTag('bases-contagens')
  return result
}

// Importa composições para tabela_composicoes + tabela_itens_composicao (base global)
export async function importarComposicoesParaBase(
  baseId: string,
  rows: ImportComposicaoRow[]
): Promise<ImportResult> {
  const supabase = await createClient()
  const sb = supabase as any
  const result: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [] }

  // ── 1. Coletar todos os insumos únicos das composições ────────────────────
  const insumosPorCodigo = new Map<string, ImportInsumoRow>()
  for (const comp of rows) {
    for (const ins of comp.insumos) {
      if (ins.codigo && !insumosPorCodigo.has(ins.codigo)) insumosPorCodigo.set(ins.codigo, ins)
    }
  }
  const todosCodigos = [...insumosPorCodigo.keys()]

  // ── 2. Buscar/criar insumos nesta base (paralelo) ─────────────────────────
  const codeToId = new Map<string, string>()

  const fetchInsumoResults = await Promise.all(
    Array.from({ length: Math.ceil(todosCodigos.length / 500) }, (_, i) =>
      sb.from('tabela_insumos').select('id, codigo').eq('base_id', baseId)
        .in('codigo', todosCodigos.slice(i * 500, (i + 1) * 500))
    )
  )
  for (const { data } of fetchInsumoResults)
    for (const ins of (data ?? []) as { id: string; codigo: string }[]) codeToId.set(ins.codigo, ins.id)

  const ausentes = todosCodigos.filter(c => !codeToId.has(c))
  const ausLotes = Array.from({ length: Math.ceil(ausentes.length / 500) }, (_, i) =>
    ausentes.slice(i * 500, (i + 1) * 500).map(codigo => {
      const ins = insumosPorCodigo.get(codigo)!
      return { codigo, descricao: ins.descricao, unidade: ins.unidade, preco_base: ins.custo, grupo: ins.grupo, fonte: ins.base, data_referencia: ins.data_ref, base_id: baseId }
    })
  )
  const insertAusResults = await Promise.all(ausLotes.map(lote => sb.from('tabela_insumos').insert(lote).select('id, codigo')))
  for (const { data, error } of insertAusResults) {
    if (error) { result.erros.push(`Insumos automáticos: ${error.message}`); continue }
    for (const ins of (data ?? []) as { id: string; codigo: string }[]) {
      codeToId.set(ins.codigo, ins.id)
      result.insumosCriados++
    }
  }

  // ── 3. Deduplicar por código (SINAPI pode ter duplicatas na planilha) ────────
  const rowsMap = new Map<string, ImportComposicaoRow>()
  for (const r of rows) { if (!rowsMap.has(r.codigo)) rowsMap.set(r.codigo, r) }
  const rowsUniq = [...rowsMap.values()]

  // ── 4. Buscar existentes e inserir novas composições (paralelo) ─────────────
  const compCodeToId = new Map<string, string>()

  const fetchCompResults = await Promise.all(
    Array.from({ length: Math.ceil(rowsUniq.length / 500) }, (_, i) =>
      sb.from('tabela_composicoes').select('id, codigo').eq('base_id', baseId)
        .in('codigo', rowsUniq.slice(i * 500, (i + 1) * 500).map(r => r.codigo))
    )
  )
  for (const { data } of fetchCompResults)
    for (const c of (data ?? []) as { id: string; codigo: string }[]) compCodeToId.set(c.codigo, c.id)

  const novas = rowsUniq.filter(r => !compCodeToId.has(r.codigo))
  const novasLotes = Array.from({ length: Math.ceil(novas.length / 500) }, (_, i) => novas.slice(i * 500, (i + 1) * 500))
  const insertCompResults = await Promise.all(
    novasLotes.map(lote =>
      sb.from('tabela_composicoes')
        .insert(lote.map(c => ({ codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, base_id: baseId })))
        .select('id, codigo')
    )
  )
  for (const { data, error } of insertCompResults) {
    if (error) { result.erros.push(`Composições: ${error.message}`); continue }
    for (const c of (data ?? []) as { id: string; codigo: string }[]) compCodeToId.set(c.codigo, c.id)
    result.composicoesCriadas += (data ?? []).length
  }

  // ── 5. Apaga itens antigos e reinserve todos em paralelo ──────────────────
  const allCompIds = [...compCodeToId.values()]
  await Promise.all(
    Array.from({ length: Math.ceil(allCompIds.length / 500) }, (_, i) =>
      sb.from('tabela_itens_composicao').delete().in('composicao_id', allCompIds.slice(i * 500, (i + 1) * 500))
    )
  )

  const allItens = rowsUniq.flatMap(comp => {
    const compId = compCodeToId.get(comp.codigo)
    if (!compId) return []
    return comp.insumos.filter(ins => codeToId.has(ins.codigo)).map(ins => ({
      composicao_id: compId,
      insumo_id: codeToId.get(ins.codigo)!,
      indice: ins.indice ?? 1,
    }))
  })
  const itemLotes = Array.from({ length: Math.ceil(allItens.length / 500) }, (_, i) => allItens.slice(i * 500, (i + 1) * 500))
  const insertItemResults = await Promise.all(itemLotes.map(lote => sb.from('tabela_itens_composicao').insert(lote)))
  for (const { error } of insertItemResults)
    if (error) result.erros.push(`Itens: ${error.message}`)

  revalidatePath('/bases')
  revalidateTag('bases-contagens')
  return result
}
