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
  gruposAtualizados?: number
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

  // 3. Propagar custo para insumos de composições com o mesmo código (paralelo)
  const custoMap = new Map<string, number>(insumos.map(ins => [ins.codigo, ins.custo]))

  await Promise.all(
    Array.from({ length: Math.ceil(allCodigos.length / 500) }, (_, i) => allCodigos.slice(i * 500, (i + 1) * 500))
      .map(async (batch) => {
        const { data: compInsumos } = await sb
          .from('orcamento_insumos')
          .select('id, codigo')
          .eq('orcamento_id', orcamentoId)
          .not('composicao_id', 'is', null)
          .in('codigo', batch)

        if (!compInsumos?.length) return

        const custoToIds = new Map<number, string[]>()
        for (const ins of compInsumos as { id: string; codigo: string }[]) {
          const novoCusto = custoMap.get(ins.codigo)
          if (novoCusto === undefined) continue
          if (!custoToIds.has(novoCusto)) custoToIds.set(novoCusto, [])
          custoToIds.get(novoCusto)!.push(ins.id)
        }

        await Promise.all(
          [...custoToIds.entries()].flatMap(([custo, ids]) =>
            Array.from({ length: Math.ceil(ids.length / 500) }, (_, j) =>
              sb.from('orcamento_insumos').update({ custo }).in('id', ids.slice(j * 500, (j + 1) * 500))
            )
          )
        )
      })
  )

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

  // 1. Verificar quais composições já existem para não criar duplicatas (paralelo)
  const jaExistemIds = new Map<string, string>()
  const fetchExistResults = await Promise.all(
    Array.from({ length: Math.ceil(allCodigos.length / 500) }, (_, i) =>
      sb.from('orcamento_composicoes').select('id, codigo').eq('orcamento_id', orcamentoId)
        .in('codigo', allCodigos.slice(i * 500, (i + 1) * 500))
    )
  )
  for (const { data } of fetchExistResults)
    for (const c of (data ?? []) as { id: string; codigo: string }[]) jaExistemIds.set(c.codigo, c.id)

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
    await Promise.all(
      Array.from({ length: Math.ceil(idsExistentes.length / 500) }, (_, i) =>
        sb.from('orcamento_insumos').delete().in('composicao_id', idsExistentes.slice(i * 500, (i + 1) * 500))
      )
    )
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

  // 4. Inserir todos os insumos em paralelo (lotes de 500)
  const insumoLotes = Array.from({ length: Math.ceil(insumoRows.length / 500) }, (_, i) => insumoRows.slice(i * 500, (i + 1) * 500))
  const insertInsumoResults = await Promise.all(insumoLotes.map(lote => sb.from('orcamento_insumos').insert(lote)))
  for (let i = 0; i < insertInsumoResults.length; i++) {
    const { error } = insertInsumoResults[i]
    if (error) result.erros.push(`Insumos lote ${i + 1}: ${error.message}`)
    else result.insumosCriados += insumoLotes[i].length
  }

  revalidatePath(`/orcamentos/${orcamentoId}/composicoes`)
  revalidatePath(`/orcamentos/${orcamentoId}/insumos`)
  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Bases globais
// ─────────────────────────────────────────────────────────────────────────────

export interface BaseInfo {
  id: string
  nome: string
  orgao: string
  tipo_base: 'externa' | 'propria'
  total_insumos: number
  total_composicoes: number
}

export async function listBases(): Promise<BaseInfo[]> {
  const supabase = await createClient()
  const sb = supabase as any

  const { data: bases } = await sb
    .from('tabela_bases')
    .select('id, nome, orgao, tipo_base')
    .order('tipo_base')
    .order('orgao')

  if (!bases?.length) return []

  const result: BaseInfo[] = await Promise.all(
    (bases as { id: string; nome: string; orgao: string; tipo_base: 'externa' | 'propria' }[]).map(async (b) => {
      const [{ count: ni }, { count: nc }] = await Promise.all([
        sb.from('tabela_insumos').select('*', { count: 'exact', head: true }).eq('base_id', b.id),
        sb.from('tabela_composicoes').select('*', { count: 'exact', head: true }).eq('base_id', b.id),
      ])
      return { ...b, total_insumos: ni ?? 0, total_composicoes: nc ?? 0 }
    })
  )

  return result
}

// ─────────────────────────────────────────────────────────────────────────────
// Importação interna: copia de base global → orçamento
// ─────────────────────────────────────────────────────────────────────────────

export async function importarDaBase(
  orcamentoId: string,
  baseId: string,
  opcoes: { insumos: boolean; composicoes: boolean }
): Promise<ImportResult> {
  const supabase = await createClient()
  const sb = supabase as any
  const result: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [] }

  const { data: base } = await sb.from('tabela_bases').select('orgao').eq('id', baseId).single()
  const baseLabel: string = base?.orgao ?? ''

  // ── Insumos ────────────────────────────────────────────────────────────────
  if (opcoes.insumos) {
    const allInsumos: any[] = []
    const BATCH = 1000
    let start = 0
    while (true) {
      const { data, error } = await sb
        .from('tabela_insumos')
        .select('codigo, descricao, unidade, preco_base, grupo, fonte, data_referencia')
        .eq('base_id', baseId)
        .range(start, start + BATCH - 1)
      if (error) { result.erros.push(`Insumos: ${error.message}`); break }
      allInsumos.push(...(data ?? []))
      if ((data?.length ?? 0) < BATCH) break
      start += BATCH
    }

    if (allInsumos.length > 0) {
      const rows: ImportInsumoRow[] = allInsumos.map((ins: any) => ({
        codigo: ins.codigo,
        descricao: ins.descricao,
        unidade: ins.unidade,
        custo: ins.preco_base ?? 0,
        indice: 1,
        grupo: ins.grupo ?? null,
        base: ins.fonte ?? baseLabel,
        data_ref: ins.data_referencia ?? null,
      }))
      const r = await importarInsumos(orcamentoId, rows)
      result.insumosCriados += r.insumosCriados
      result.erros.push(...r.erros)
    }
  }

  // ── Composições ────────────────────────────────────────────────────────────
  if (opcoes.composicoes) {
    const allComps: any[] = []
    const BATCH = 500
    let start = 0
    while (true) {
      const { data, error } = await sb
        .from('tabela_composicoes')
        .select('id, codigo, descricao, unidade')
        .eq('base_id', baseId)
        .range(start, start + BATCH - 1)
      if (error) { result.erros.push(`Composições: ${error.message}`); break }
      allComps.push(...(data ?? []))
      if ((data?.length ?? 0) < BATCH) break
      start += BATCH
    }

    if (allComps.length > 0) {
      // Busca itens em paralelo (lotes de 100 IDs de composição)
      const compIds = allComps.map((c: any) => c.id)
      const itemsByComp = new Map<string, any[]>()
      const itemFetchResults = await Promise.all(
        Array.from({ length: Math.ceil(compIds.length / 100) }, (_, i) =>
          sb.from('tabela_itens_composicao')
            .select('composicao_id, indice, insumo:tabela_insumos(codigo, descricao, unidade, preco_base, grupo, fonte, data_referencia)')
            .in('composicao_id', compIds.slice(i * 100, (i + 1) * 100))
        )
      )
      for (const { data, error } of itemFetchResults) {
        if (error) { result.erros.push(`Itens: ${error.message}`); continue }
        for (const item of (data ?? []) as any[]) {
          if (!itemsByComp.has(item.composicao_id)) itemsByComp.set(item.composicao_id, [])
          itemsByComp.get(item.composicao_id)!.push(item)
        }
      }

      const rows: ImportComposicaoRow[] = allComps.map((comp: any) => ({
        codigo: comp.codigo,
        descricao: comp.descricao,
        unidade: comp.unidade,
        base: baseLabel,
        insumos: (itemsByComp.get(comp.id) ?? []).map((item: any) => ({
          codigo: item.insumo?.codigo ?? '',
          descricao: item.insumo?.descricao ?? '',
          unidade: item.insumo?.unidade ?? '',
          custo: item.insumo?.preco_base ?? 0,
          indice: item.indice ?? 1,
          grupo: item.insumo?.grupo ?? null,
          base: item.insumo?.fonte ?? baseLabel,
          data_ref: item.insumo?.data_referencia ?? null,
        })),
      }))

      const r = await importarComposicoes(orcamentoId, rows)
      result.composicoesCriadas += r.composicoesCriadas
      result.insumosCriados += r.insumosCriados
      result.erros.push(...r.erros)
    }
  }

  return result
}
