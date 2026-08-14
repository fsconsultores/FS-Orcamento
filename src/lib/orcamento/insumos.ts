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
 * Só os avulsos (composicao_id IS NULL) — têm custo/fornecedor/etc próprios
 * na própria linha, sem depender de nenhum outro dado (ao contrário do
 * custo_unitario de uma composição, o custo de um insumo nunca está "em
 * cadeia"). É a fatia rápida e imediatamente completa da tela de Insumos —
 * ver `getInsumosDetalhadoAction` para a fatia lenta (insumos embutidos em
 * composições sem avulso equivalente + "usados/não usados").
 */
export async function getAvulsosBasico(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<OrcamentoInsumo[]> {
  return fetchAllPaginatedParallel<OrcamentoInsumo>(
    (from, to) =>
      supabase
        .from(TABLE)
        .select('*', { count: 'exact' })
        .eq('orcamento_id', orcamentoId)
        .is('composicao_id', null)
        .order('codigo')
        .range(from, to) as any
  )
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

  // 3. Avulsos deste orçamento — têm custo explícito e prioridade na
  //    deduplicação abaixo. Ver getAvulsosBasico (comentário original sobre
  //    o motivo do filtro direto no banco + paginação em paralelo continua
  //    lá).
  const avulsos = await getAvulsosBasico(supabase, orcamentoId)

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

export interface CotacaoInsumoInput {
  fornecedor?: string | null
  dataCotacao?: string | null
  observacoes?: string | null
  /**
   * Preço provisório, sujeito a alteração — nunca marcado direto num insumo;
   * só existe como parte do registro de uma cotação (ver upsertAvulsoInsumo).
   * O Caderno deriva "Serviços com Preços Estimados" varrendo os insumos de
   * cada composição/item em busca deste flag — não há marcação manual no
   * item da planilha.
   */
  estimado?: boolean
  estimadoMotivo?: string | null
}

/**
 * Atualiza (ou cria, se não existir) o preço "avulso" (canônico) de um código
 * de insumo no orçamento inteiro, e sincroniza as cópias do mesmo código
 * dentro de composições — mesmo padrão já usado em insumos-table.tsx.
 *
 * Quando `cotacao` é informado, registra também uma linha nova em
 * orcamento_insumo_cotacoes (nunca sobrescreve uma cotação existente — a
 * anterior só é desativada) e copia fornecedor/data/observações pro avulso,
 * pra a aba Insumos não precisar de join nenhum pra exibir isso. Chamadores
 * que não passam `cotacao` mantêm o comportamento de sempre (só o preço).
 */
export async function upsertAvulsoInsumo(
  supabase: SupabaseClient,
  orcamentoId: string,
  codigo: string,
  novoCusto: number,
  extra?: { descricao?: string; unidade?: string; grupo?: string | null },
  cotacao?: CotacaoInsumoInput
): Promise<void> {
  const camposAvulso: Record<string, unknown> = { custo: novoCusto }

  if (cotacao) {
    const sb = supabase as any
    await sb.from('orcamento_insumo_cotacoes')
      .update({ ativa: false })
      .eq('orcamento_id', orcamentoId).eq('codigo', codigo).eq('ativa', true)

    const { data: { user } } = await supabase.auth.getUser()
    const fornecedor = cotacao.fornecedor?.trim() || null
    const dataCotacao = cotacao.dataCotacao || null
    const observacoes = cotacao.observacoes?.trim() || null
    const estimado = cotacao.estimado ?? false
    const estimadoMotivo = estimado ? (cotacao.estimadoMotivo?.trim() || null) : null
    const { data: nova, error: cotErr } = await sb.from('orcamento_insumo_cotacoes')
      .insert({
        orcamento_id: orcamentoId, codigo, valor: novoCusto,
        fornecedor, data_cotacao: dataCotacao, observacoes,
        ativa: true, usuario: user?.email ?? null, user_id: user?.id ?? null,
        estimado, estimado_motivo: estimadoMotivo,
      })
      .select('id').single()
    if (cotErr) throw new Error(`Erro ao registrar cotação: ${cotErr.message}`)

    camposAvulso.fornecedor = fornecedor
    camposAvulso.data_cotacao = dataCotacao
    camposAvulso.cotacao_observacoes = observacoes
    camposAvulso.cotacao_id = nova.id
    camposAvulso.estimado = estimado
    camposAvulso.estimado_motivo = estimadoMotivo
  }

  const { data: atualizados, error: updErr } = await supabase
    .from(TABLE)
    .update(camposAvulso)
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
      indice: 1,
      grupo: extra?.grupo ?? null,
      base: null,
      data_ref: null,
      ...camposAvulso,
    })
    if (insErr) throw new Error(`Erro ao criar preço do insumo: ${insErr.message}`)
  }

  // Sincroniza o CUSTO das cópias do mesmo código dentro de composições — é o
  // mesmo material, mesmo preço em todo o orçamento, então isso continua
  // valendo pra qualquer edição do avulso. `estimado`/`estimado_motivo`
  // NÃO sincroniza mais: um insumo pode estar com preço confirmado numa
  // composição e ainda em aberto em outra (exigência real de orçamentista —
  // ex.: mesmo material com fornecedor já fechado pra uma etapa da obra e
  // não pra outra). Editar a partir da aba Insumos afeta só o avulso; editar
  // "estimado" a partir de uma composição específica usa
  // upsertInsumoDeComposicao, abaixo, que mexe só naquela linha.
  const { error: syncErr } = await supabase
    .from(TABLE)
    .update({ custo: novoCusto })
    .eq('orcamento_id', orcamentoId)
    .eq('codigo', codigo)
    .not('composicao_id', 'is', null)
  if (syncErr) throw new Error(`Erro ao sincronizar cópias do insumo: ${syncErr.message}`)
}

/**
 * Edita preço/cotação de UMA cópia específica de insumo dentro de uma
 * composição (por `insumoId`, a linha exata de orcamento_insumos) — não do
 * avulso. O CUSTO ainda sincroniza pras outras cópias do mesmo código
 * (avulso + outras composições — é a mesma tabela de preços do orçamento),
 * mas `estimado`/`estimado_motivo` ficam só nesta linha: é o que permite um
 * insumo estar "estimado" numa composição e confirmado em outra.
 *
 * Também registra em orcamento_insumo_historico_precos (o gráfico de
 * variação de preço da aba Insumos deve refletir qualquer edição de preço,
 * de onde quer que ela venha) — mas NÃO em orcamento_insumo_cotacoes, que é
 * o histórico de cotações do avulso; misturar cotações "só desta composição"
 * ali confundiria o que é a cotação oficial do código.
 */
export async function upsertInsumoDeComposicao(
  supabase: SupabaseClient,
  orcamentoId: string,
  insumoId: string,
  codigo: string,
  novoCusto: number,
  precoAnterior: number,
  cotacao?: CotacaoInsumoInput
): Promise<void> {
  const fornecedor = cotacao?.fornecedor?.trim() || null
  const dataCotacao = cotacao?.dataCotacao || null
  const observacoes = cotacao?.observacoes?.trim() || null
  const estimado = cotacao?.estimado ?? false
  const estimadoMotivo = estimado ? (cotacao?.estimadoMotivo?.trim() || null) : null

  const { error: updErr } = await supabase
    .from(TABLE)
    .update({ custo: novoCusto, estimado, estimado_motivo: estimadoMotivo })
    .eq('id', insumoId)
    .eq('orcamento_id', orcamentoId)
  if (updErr) throw new Error(`Erro ao atualizar insumo da composição: ${updErr.message}`)

  const { error: syncErr } = await supabase
    .from(TABLE)
    .update({ custo: novoCusto })
    .eq('orcamento_id', orcamentoId)
    .eq('codigo', codigo)
    .neq('id', insumoId)
  if (syncErr) throw new Error(`Erro ao sincronizar preço do insumo: ${syncErr.message}`)

  if (novoCusto !== precoAnterior) {
    const sb = supabase as any
    const { data: { user } } = await supabase.auth.getUser()
    const { error: histErr } = await sb.from('orcamento_insumo_historico_precos').insert({
      orcamento_id: orcamentoId, codigo,
      preco_anterior: precoAnterior, preco_novo: novoCusto,
      usuario: user?.email ?? null,
      fornecedor, data_cotacao: dataCotacao, observacoes,
    })
    if (histErr) throw new Error(`Erro ao registrar histórico de preço: ${histErr.message}`)
  }
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
  // codigo -> id[] (não codigo -> id): o código de uma composição não é
  // garantido único em orcamento_composicoes (reimportações/duplicações
  // históricas podem deixar várias linhas com o mesmo código, ids
  // diferentes). Um Map codigo->id só guardaria a última e perderia os
  // insumos das outras — código real observado: "Forno de Minas" tem 7
  // códigos de composição com até 9 linhas duplicadas cada, o que fazia
  // itens de fato usados na planilha marcarem só uma das duplicatas como
  // usada e todas as outras (mesmo código, insumos diferentes) como não
  // usadas.
  const compCodeToIds = new Map<string, string[]>()
  for (const c of composicoes) {
    const arr = compCodeToIds.get(c.codigo) ?? []
    arr.push(c.id)
    compCodeToIds.set(c.codigo, arr)
  }
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
    const compIds = compCodeToIds.get(codigo)
    if (!compIds || visitados.has(codigo)) return
    const proximosVisitados = new Set(visitados).add(codigo)
    for (const compId of compIds) {
      for (const subCodigo of compIdToInsumoCodigos.get(compId) ?? []) {
        marcar(subCodigo, proximosVisitados)
      }
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
