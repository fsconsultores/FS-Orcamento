import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrcamentoInsumo, CreateInsumoData, UpdateInsumoData } from './types'
import { fetchAllPaginatedParallel } from './paginate'

const TABLE = 'orcamento_insumos'

export interface InsumosByOrcamentoDetalhado {
  /** Deduplicado — mesmo retorno de sempre de getInsumosByOrcamento. */
  insumos: OrcamentoInsumo[]
  /**
   * Todos os insumos vinculados a alguma composição do orçamento, SEM a
   * deduplicação (que descarta a linha-filha quando existe avulso com o
   * mesmo código) — quem precisa do vínculo composição→insumos filhos
   * (calcularCodigosUtilizados, montagem de export) usa isto em vez de
   * rodar uma nova varredura de orcamento_insumos.
   */
  insumosDeComposicao: OrcamentoInsumo[]
}

/**
 * Versão que expõe também `insumosDeComposicao` (dado já buscado
 * internamente) — evita que cada chamador que precisa dessa relação
 * (Insumos do orçamento, Caderno/Relatórios) rode sua própria varredura
 * redundante de orcamento_insumos. `getInsumosByOrcamento` abaixo é um
 * wrapper fino sobre esta função, mantendo o contrato antigo inalterado.
 */
export async function getInsumosByOrcamentoDetalhado(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<InsumosByOrcamentoDetalhado> {
  // 2. Todos os insumos vinculados a composições deste orçamento — via
  //    vw_insumos_de_composicao (JOIN orcamento_insumos+orcamento_composicoes
  //    já feito no banco), filtrando por orcamento_id direto. `orcamento_id`
  //    na view vem da COMPOSIÇÃO (sempre correto), não da linha do insumo —
  //    preserva a mesma defesa contra orcamento_id inconsistente que o
  //    filtro por compIds tinha, só que em 1 requisição em vez de N/100
  //    (era o gargalo dominante em orçamentos com muitas composições).
  //    `orcamento_id_raw` (valor cru da linha) vem junto só para a
  //    auto-correção abaixo não precisar de uma consulta extra. Páginas
  //    buscadas em paralelo (fetchAllPaginatedParallel) — em orçamentos com
  //    muitos insumos vinculados a composições isso soma até dezenas de
  //    milhares de linhas, e paginação sequencial somava a latência de cada
  //    página em vez de pagar só a mais lenta.
  const porCompComRaw = await fetchAllPaginatedParallel<OrcamentoInsumo & { orcamento_id_raw: string }>(
    (from, to) =>
      supabase
        .from('vw_insumos_de_composicao')
        .select('*', { count: 'exact' })
        .eq('orcamento_id', orcamentoId)
        .order('codigo')
        .range(from, to) as any
  )
  const porComp: OrcamentoInsumo[] = porCompComRaw

  // Auto-correção: atualiza orcamento_id incorreto para garantir consistência futura
  if (porCompComRaw.length > 0) {
    const idsErrados = porCompComRaw
      .filter(ins => ins.orcamento_id_raw !== orcamentoId)
      .map(ins => ins.id)
    if (idsErrados.length > 0) {
      for (let i = 0; i < idsErrados.length; i += 500) {
        await supabase
          .from(TABLE)
          .update({ orcamento_id: orcamentoId })
          .in('id', idsErrados.slice(i, i + 500))
      }
    }
  }

  // 3. Avulsos deste orçamento (composicao_id IS NULL) — têm custo explícito
  //    e prioridade na deduplicação abaixo. Filtra direto no banco: a versão
  //    antiga buscava TODOS os insumos do orçamento (inclusive os vinculados
  //    a composições, potencialmente milhares de linhas) só para em seguida
  //    descartar tudo que não fosse avulso — em orçamentos grandes isso
  //    sozinho gerava dezenas de páginas sequenciais de 1000 linhas (o maior
  //    gargalo medido em produção: 27 queries / ~9s numa única visita à aba
  //    Insumos). Em orçamentos com um catálogo de avulsos muito grande
  //    (alguns passam de 9 mil linhas — provavelmente uma base de preços
  //    inteira importada como avulsos) mesmo só os avulsos ainda paginam
  //    bastante, daí buscar as páginas em paralelo em vez de sequencial.
  const avulsos = await fetchAllPaginatedParallel<OrcamentoInsumo>(
    (from, to) =>
      supabase
        .from(TABLE)
        .select('*', { count: 'exact' })
        .eq('orcamento_id', orcamentoId)
        .is('composicao_id', null)
        .order('codigo')
        .range(from, to) as any
  )

  // Insumos de composições (custo=0) só aparecem se não houver avulso com o mesmo código.
  const avulsosCodigos = new Set(avulsos.map(ins => ins.codigo ?? ''))
  const compSemAvulso = porComp.filter(ins => !avulsosCodigos.has(ins.codigo ?? ''))
  const seen = new Set<string>()
  const insumos = [...avulsos, ...compSemAvulso].filter(ins => {
    const key = ins.codigo ?? ''
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return { insumos, insumosDeComposicao: porComp }
}

export async function getInsumosByOrcamento(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<OrcamentoInsumo[]> {
  const { insumos } = await getInsumosByOrcamentoDetalhado(supabase, orcamentoId)
  return insumos
}

export async function createInsumo(
  supabase: SupabaseClient,
  orcamentoId: string,
  data: CreateInsumoData
): Promise<OrcamentoInsumo> {
  const { data: created, error } = await supabase
    .from(TABLE)
    .insert({ ...data, orcamento_id: orcamentoId })
    .select()
    .single()

  if (error) throw new Error(`Erro ao criar insumo: ${error.message}`)
  return created as OrcamentoInsumo
}

export async function updateInsumo(
  supabase: SupabaseClient,
  orcamentoId: string,
  insumoId: string,
  data: UpdateInsumoData
): Promise<OrcamentoInsumo> {
  const { data: updated, error } = await supabase
    .from(TABLE)
    .update(data)
    .eq('id', insumoId)
    .eq('orcamento_id', orcamentoId) // garante isolamento
    .select()
    .single()

  if (error) throw new Error(`Erro ao atualizar insumo: ${error.message}`)
  return updated as OrcamentoInsumo
}

export async function deleteInsumo(
  supabase: SupabaseClient,
  orcamentoId: string,
  insumoId: string
): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', insumoId)
    .eq('orcamento_id', orcamentoId) // garante isolamento

  if (error) throw new Error(`Erro ao excluir insumo: ${error.message}`)
}

/**
 * Atualiza (ou cria, se não existir) o preço "avulso" (canônico) de um código
 * de insumo no orçamento inteiro, e sincroniza as cópias do mesmo código
 * dentro de composições — mesmo padrão já usado em insumos-table.tsx.
 */
export async function upsertAvulsoInsumo(
  supabase: SupabaseClient,
  orcamentoId: string,
  codigo: string,
  novoCusto: number,
  extra?: { descricao?: string; unidade?: string; grupo?: string | null }
): Promise<void> {
  const { data: atualizados, error: updErr } = await supabase
    .from(TABLE)
    .update({ custo: novoCusto })
    .eq('orcamento_id', orcamentoId)
    .eq('codigo', codigo)
    .is('composicao_id', null)
    .select('id')
  if (updErr) throw new Error(`Erro ao atualizar preço do insumo: ${updErr.message}`)

  if (!atualizados || atualizados.length === 0) {
    const { error: insErr } = await supabase.from(TABLE).insert({
      orcamento_id: orcamentoId,
      composicao_id: null,
      codigo,
      descricao: extra?.descricao ?? codigo,
      unidade: extra?.unidade ?? '',
      custo: novoCusto,
      indice: 1,
      grupo: extra?.grupo ?? null,
      base: null,
      data_ref: null,
    })
    if (insErr) throw new Error(`Erro ao criar preço do insumo: ${insErr.message}`)
  }

  // Sincroniza as cópias do mesmo código dentro de composições: o motor de
  // cálculo já prioriza o avulso, mas outras telas (Planilha analítica) leem
  // o `custo` da linha direto, sem passar pelo avulso.
  const { error: syncErr } = await supabase
    .from(TABLE)
    .update({ custo: novoCusto })
    .eq('orcamento_id', orcamentoId)
    .eq('codigo', codigo)
    .not('composicao_id', 'is', null)
  if (syncErr) throw new Error(`Erro ao sincronizar cópias do insumo: ${syncErr.message}`)
}

/**
 * Calcula o conjunto de códigos (insumos e composições) efetivamente usados
 * na planilha do orçamento: todo código referenciado diretamente por um item
 * da estrutura, mais os insumos de qualquer composição usada (recursivamente,
 * por composições aninhadas). Puro/sem I/O — o caller já buscou os dados.
 */
export function calcularCodigosUtilizados(
  estruturaCodigos: (string | null)[],
  composicoes: { id: string; codigo: string }[],
  insumosDeComposicao: { composicao_id: string | null; codigo: string }[]
): Set<string> {
  const compCodeToId = new Map(composicoes.map(c => [c.codigo, c.id]))
  const compIdToInsumoCodigos = new Map<string, string[]>()
  for (const ins of insumosDeComposicao) {
    if (!ins.composicao_id) continue
    const arr = compIdToInsumoCodigos.get(ins.composicao_id) ?? []
    arr.push(ins.codigo)
    compIdToInsumoCodigos.set(ins.composicao_id, arr)
  }

  const usados = new Set<string>()

  function marcar(codigo: string, visitados: Set<string>) {
    usados.add(codigo)
    const compId = compCodeToId.get(codigo)
    if (!compId || visitados.has(codigo)) return
    const proximosVisitados = new Set(visitados).add(codigo)
    for (const subCodigo of compIdToInsumoCodigos.get(compId) ?? []) {
      marcar(subCodigo, proximosVisitados)
    }
  }

  for (const codigo of estruturaCodigos) {
    if (codigo) marcar(codigo, new Set())
  }

  return usados
}

export async function createInsumosBatch(
  supabase: SupabaseClient,
  orcamentoId: string,
  insumos: CreateInsumoData[]
): Promise<OrcamentoInsumo[]> {
  const rows = insumos.map((i) => ({ ...i, orcamento_id: orcamentoId }))

  const { data, error } = await supabase
    .from(TABLE)
    .insert(rows)
    .select()

  if (error) throw new Error(`Erro ao importar insumos: ${error.message}`)
  return data as OrcamentoInsumo[]
}
