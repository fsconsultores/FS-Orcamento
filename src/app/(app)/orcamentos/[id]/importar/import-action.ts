'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface ImportInsumoRow {
  codigo: string
  descricao: string
  unidade: string
  custo: number
  indice: number
  grupo: string | null
  base: string | null
  data_ref: string | null
}

export interface ImportComposicaoRow {
  codigo: string
  descricao: string
  unidade: string
  base: string | null
  insumos: ImportInsumoRow[]
}

export interface ImportResult {
  composicoesCriadas: number
  insumosCriados: number
  erros: string[]
}

// Importação de insumos avulsos — importados sempre sobrescrevem os existentes
export async function importarInsumos(
  orcamentoId: string,
  insumos: ImportInsumoRow[]
): Promise<ImportResult> {
  const supabase = await createClient()
  const sb = supabase as any
  const result: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [] }

  const allCodigos = insumos.map(ins => ins.codigo)

  // 1. Apagar avulsos existentes com o mesmo código (importados têm prioridade)
  for (let i = 0; i < allCodigos.length; i += 500) {
    await sb
      .from('orcamento_insumos')
      .delete()
      .eq('orcamento_id', orcamentoId)
      .is('composicao_id', null)
      .in('codigo', allCodigos.slice(i, i + 500))
  }

  // 2. Inserir todos os avulsos importados
  const rows = insumos.map(ins => ({
    orcamento_id: orcamentoId,
    composicao_id: null,
    codigo: ins.codigo,
    descricao: ins.descricao,
    unidade: ins.unidade,
    custo: ins.custo,
    indice: ins.indice ?? 1,
    grupo: ins.grupo,
    base: ins.base,
    data_ref: ins.data_ref,
  }))

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from('orcamento_insumos').insert(rows.slice(i, i + 500))
    if (error) {
      result.erros.push(`Lote ${i / 500 + 1}: ${error.message}`)
    } else {
      result.insumosCriados += Math.min(500, rows.length - i)
    }
  }

  // 3. Propagar custo para insumos de composições com o mesmo código
  const custoMap = new Map<string, number>(insumos.map(ins => [ins.codigo, ins.custo]))

  for (let i = 0; i < allCodigos.length; i += 500) {
    const { data: compInsumos } = await sb
      .from('orcamento_insumos')
      .select('id, codigo')
      .eq('orcamento_id', orcamentoId)
      .not('composicao_id', 'is', null)
      .in('codigo', allCodigos.slice(i, i + 500))

    if (!compInsumos?.length) continue

    // Agrupa ids pelo novo custo para fazer um update por valor único
    const custoToIds = new Map<number, string[]>()
    for (const ins of compInsumos as { id: string; codigo: string }[]) {
      const novoCusto = custoMap.get(ins.codigo)
      if (novoCusto === undefined) continue
      if (!custoToIds.has(novoCusto)) custoToIds.set(novoCusto, [])
      custoToIds.get(novoCusto)!.push(ins.id)
    }

    for (const [custo, ids] of custoToIds) {
      for (let j = 0; j < ids.length; j += 500) {
        await sb
          .from('orcamento_insumos')
          .update({ custo })
          .in('id', ids.slice(j, j + 500))
      }
    }
  }

  revalidatePath(`/orcamentos/${orcamentoId}/insumos`)
  revalidatePath(`/orcamentos/${orcamentoId}/composicoes`)
  return result
}

// Importação de composições com seus insumos — batch insert
export async function importarComposicoes(
  orcamentoId: string,
  rows: ImportComposicaoRow[]
): Promise<ImportResult> {
  const supabase = await createClient()
  const sb = supabase as any
  const result: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [] }

  const allCodigos = rows.map(c => c.codigo)

  // 1. Verificar quais composições já existem para não criar duplicatas
  const jaExistemIds = new Map<string, string>()
  for (let i = 0; i < allCodigos.length; i += 500) {
    const { data } = await sb
      .from('orcamento_composicoes')
      .select('id, codigo')
      .eq('orcamento_id', orcamentoId)
      .in('codigo', allCodigos.slice(i, i + 500))
    for (const c of (data ?? []) as { id: string; codigo: string }[]) {
      jaExistemIds.set(c.codigo, c.id)
    }
  }

  // 2. Inserir apenas as composições que não existem ainda
  const novas = rows.filter(r => !jaExistemIds.has(r.codigo))
  const compRows = novas.map(c => ({
    orcamento_id: orcamentoId,
    codigo: c.codigo,
    descricao: c.descricao,
    unidade: c.unidade,
    base: c.base,
  }))

  const codeToId = new Map(jaExistemIds)

  for (let i = 0; i < compRows.length; i += 500) {
    const { data, error } = await sb
      .from('orcamento_composicoes')
      .insert(compRows.slice(i, i + 500))
      .select('id, codigo')
    if (error) {
      result.erros.push(`Composições lote ${i / 500 + 1}: ${error.message}`)
      continue
    }
    for (const c of (data ?? []) as { id: string; codigo: string }[]) {
      codeToId.set(c.codigo, c.id)
    }
    result.composicoesCriadas += (data ?? []).length
  }

  // 3. Montar todos os insumos com o composicao_id correto
  //    Para composições já existentes: apaga os insumos antigos antes de reinserir
  const idsExistentes = [...jaExistemIds.values()]
  if (idsExistentes.length > 0) {
    for (let i = 0; i < idsExistentes.length; i += 500) {
      await sb
        .from('orcamento_insumos')
        .delete()
        .in('composicao_id', idsExistentes.slice(i, i + 500))
    }
  }

  const insumoRows = rows.flatMap(comp => {
    const compId = codeToId.get(comp.codigo)
    if (!compId) return []
    return comp.insumos.map(ins => ({
      orcamento_id: orcamentoId,
      composicao_id: compId,
      codigo: ins.codigo,
      descricao: ins.descricao,
      unidade: ins.unidade,
      custo: ins.custo,
      indice: ins.indice ?? 1,
      grupo: ins.grupo,
      base: ins.base,
      data_ref: ins.data_ref,
    }))
  })

  // 4. Inserir todos os insumos em batch (até 500 por vez)
  for (let i = 0; i < insumoRows.length; i += 500) {
    const { error } = await sb.from('orcamento_insumos').insert(insumoRows.slice(i, i + 500))
    if (error) {
      result.erros.push(`Insumos lote ${i / 500 + 1}: ${error.message}`)
    } else {
      result.insumosCriados += Math.min(500, insumoRows.length - i)
    }
  }

  revalidatePath(`/orcamentos/${orcamentoId}/composicoes`)
  revalidatePath(`/orcamentos/${orcamentoId}/insumos`)
  return result
}
