'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { ImportInsumoRow, ImportComposicaoRow, ImportResult } from '@/app/(app)/orcamentos/[id]/importar/import-action'

export { type ImportInsumoRow, type ImportComposicaoRow, type ImportResult }

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
  for (let i = 0; i < allCodigos.length; i += 500) {
    await sb.from('tabela_insumos').delete().eq('base_id', baseId).in('codigo', allCodigos.slice(i, i + 500))
  }

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

  for (let i = 0; i < insRows.length; i += 500) {
    const { error } = await sb.from('tabela_insumos').insert(insRows.slice(i, i + 500))
    if (error) result.erros.push(`Lote ${i / 500 + 1}: ${error.message}`)
    else result.insumosCriados += Math.min(500, insRows.length - i)
  }

  revalidatePath('/bases')
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

  // ── 2. Buscar/criar insumos nesta base ─────────────────────────────────────
  const codeToId = new Map<string, string>()

  for (let i = 0; i < todosCodigos.length; i += 500) {
    const { data } = await sb
      .from('tabela_insumos').select('id, codigo').eq('base_id', baseId)
      .in('codigo', todosCodigos.slice(i, i + 500))
    for (const ins of (data ?? []) as { id: string; codigo: string }[]) codeToId.set(ins.codigo, ins.id)
  }

  const ausentes = todosCodigos.filter(c => !codeToId.has(c))
  for (let i = 0; i < ausentes.length; i += 500) {
    const lote = ausentes.slice(i, i + 500).map(codigo => {
      const ins = insumosPorCodigo.get(codigo)!
      return { codigo, descricao: ins.descricao, unidade: ins.unidade, preco_base: ins.custo, grupo: ins.grupo, fonte: ins.base, data_referencia: ins.data_ref, base_id: baseId }
    })
    const { data, error } = await sb.from('tabela_insumos').insert(lote).select('id, codigo')
    if (error) { result.erros.push(`Insumos automáticos: ${error.message}`); break }
    for (const ins of (data ?? []) as { id: string; codigo: string }[]) {
      codeToId.set(ins.codigo, ins.id)
      result.insumosCriados++
    }
  }

  // ── 3. Deduplicar por código (SINAPI pode ter duplicatas na planilha) ────────
  const rowsMap = new Map<string, ImportComposicaoRow>()
  for (const r of rows) { if (!rowsMap.has(r.codigo)) rowsMap.set(r.codigo, r) }
  const rowsUniq = [...rowsMap.values()]

  // ── 4. Upsert composições (ignora duplicatas já existentes no banco) ────────
  // Busca IDs das que já existem para poder linkar os itens
  const compCodeToId = new Map<string, string>()
  for (let i = 0; i < rowsUniq.length; i += 500) {
    const { data } = await sb
      .from('tabela_composicoes').select('id, codigo').eq('base_id', baseId)
      .in('codigo', rowsUniq.slice(i, i + 500).map(r => r.codigo))
    for (const c of (data ?? []) as { id: string; codigo: string }[]) compCodeToId.set(c.codigo, c.id)
  }
  const novas = rowsUniq.filter(r => !compCodeToId.has(r.codigo))

  for (let i = 0; i < novas.length; i += 50) {
    const lote = novas.slice(i, i + 50)
    const { data, error } = await sb
      .from('tabela_composicoes')
      .insert(lote.map(c => ({ codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, base_id: baseId })))
      .select('id, codigo')
    if (error) { result.erros.push(`Composições: ${error.message}`); continue }
    for (const c of (data ?? []) as { id: string; codigo: string }[]) compCodeToId.set(c.codigo, c.id)
    result.composicoesCriadas += (data ?? []).length
  }

  // ── 5. Inserir itens apenas das composições recém-criadas ──────────────────
  for (let i = 0; i < novas.length; i += 50) {
    const lote = novas.slice(i, i + 50)
    const itens = lote.flatMap(comp => {
      const compId = compCodeToId.get(comp.codigo)
      if (!compId) return []
      return comp.insumos.filter(ins => codeToId.has(ins.codigo)).map(ins => ({
        composicao_id: compId,
        insumo_id: codeToId.get(ins.codigo)!,
        indice: ins.indice ?? 1,
      }))
    })
    if (itens.length > 0) {
      const { error: ie } = await sb.from('tabela_itens_composicao').insert(itens)
      if (ie) result.erros.push(`Itens: ${ie.message}`)
    }
  }

  revalidatePath('/bases')
  return result
}
