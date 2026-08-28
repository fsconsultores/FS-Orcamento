/**
 * Domain service for duplicating an orcamento.
 * Pure business logic — no auth checks, no cache invalidation, no logging.
 * Those concerns live in the server action layer.
 */

import { aplicarModeloAcrescimo, salvarTaxaAdministracaoItens, type ModeloAcrescimo, type TaxaAdministracaoItem } from './modelo-acrescimo'
import { persistirTotaisPlanilha } from './motor-calculo'

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size))
}

async function gerarNomeCopia(sb: any, userId: string, nomeOrig: string): Promise<string> {
  const { data } = await sb
    .from('tabela_orcamentos')
    .select('id')
    .eq('user_id', userId)
    .ilike('nome_obra', `Cópia%de ${nomeOrig}`)
  const n = data?.length ?? 0
  return n === 0 ? `Cópia de ${nomeOrig}` : `Cópia ${n + 1} de ${nomeOrig}`
}

async function criarNovoOrcamento(
  sb: any,
  userId: string,
  orig: any,
  codigo: string
): Promise<{ id: string; nome_obra: string }> {
  const nomeNovo = await gerarNomeCopia(sb, userId, orig.nome_obra)
  const { data, error } = await sb
    .from('tabela_orcamentos')
    .insert({
      user_id: userId,
      nome_obra: nomeNovo,
      cliente: orig.cliente ?? null,
      data: orig.data,
      bdi_global: orig.bdi_global,
      modelo_acrescimo: orig.modelo_acrescimo,
      codigo,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Erro ao criar orçamento: ${error.message}`)
  return { id: data.id, nome_obra: nomeNovo }
}

async function clonarPlanilhas(sb: any, fromId: string, toId: string): Promise<Record<string, string>> {
  const { data: planilhas } = await sb
    .from('orcamento_planilhas')
    .select('id, nome, bdi_global, ordem')
    .eq('orcamento_id', fromId)
    .order('ordem')

  const map: Record<string, string> = {}
  if (!planilhas?.length) return map

  const { data: inserted, error } = await sb
    .from('orcamento_planilhas')
    .insert(planilhas.map((p: any) => ({
      orcamento_id: toId,
      nome: p.nome,
      bdi_global: p.bdi_global,
      ordem: p.ordem,
    })))
    .select('id')

  if (error) { console.error('[dup] planilhas:', error); return map }
  planilhas.forEach((p: any, i: number) => { if (inserted?.[i]) map[p.id] = inserted[i].id })
  return map
}

async function clonarEstrutura(
  sb: any,
  fromId: string,
  toId: string,
  planilhaIdMap: Record<string, string>
): Promise<void> {
  const { data: rows } = await sb
    .from('orcamento_estrutura')
    .select('id, parent_id, planilha_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, bdi_especifico, tipo, ordem, eh_taxa_administracao, estimado, estimado_motivo, valor_estimado')
    .eq('orcamento_id', fromId)
    .order('nivel')
    .order('ordem')

  if (!rows?.length) return

  const idMap: Record<string, string> = {}
  const maxNivel = Math.max(...rows.map((r: any) => r.nivel))

  for (let nivel = 1; nivel <= maxNivel; nivel++) {
    const nivelRows = rows.filter((r: any) => r.nivel === nivel)
    if (!nivelRows.length) continue

    const { data: inserted, error } = await sb
      .from('orcamento_estrutura')
      .insert(
        nivelRows.map((r: any) => ({
          orcamento_id: toId,
          parent_id: r.parent_id ? (idMap[r.parent_id] ?? null) : null,
          planilha_id: r.planilha_id ? (planilhaIdMap[r.planilha_id] ?? null) : null,
          numero: r.numero,
          nivel: r.nivel,
          codigo: r.codigo,
          descricao: r.descricao,
          unidade: r.unidade,
          quantidade: r.quantidade,
          custo_unitario: r.custo_unitario,
          bdi_especifico: r.bdi_especifico,
          tipo: r.tipo,
          ordem: r.ordem,
          eh_taxa_administracao: r.eh_taxa_administracao,
          estimado: r.estimado,
          estimado_motivo: r.estimado_motivo,
          valor_estimado: r.valor_estimado,
        }))
      )
      .select('id')

    if (error) { console.error('[dup] estrutura nivel', nivel, error); continue }
    nivelRows.forEach((r: any, i: number) => { if (inserted?.[i]) idMap[r.id] = inserted[i].id })
  }
}

async function clonarItens(sb: any, fromId: string, toId: string): Promise<void> {
  const { data: itens } = await sb
    .from('tabela_itens_orcamento')
    .select('composicao_id, orcamento_composicao_id, quantidade, bdi_especifico')
    .eq('orcamento_id', fromId)

  if (!itens?.length) return

  const rows = itens.map((i: any) => {
    const row: any = { orcamento_id: toId, quantidade: i.quantidade, bdi_especifico: i.bdi_especifico }
    if (i.orcamento_composicao_id) row.orcamento_composicao_id = i.orcamento_composicao_id
    else row.composicao_id = i.composicao_id
    return row
  })

  const erros = await Promise.all(chunk(rows, 500).map(l => sb.from('tabela_itens_orcamento').insert(l)))
  erros.forEach(({ error }: any) => { if (error) console.error('[dup] itens:', error) })
}

async function clonarComposicoes(sb: any, fromId: string, toId: string): Promise<Record<string, string>> {
  const { data: comps } = await sb
    .from('orcamento_composicoes')
    .select('id, codigo, codigo_original, descricao, unidade, base, custo_unitario, calculado_em')
    .eq('orcamento_id', fromId)

  const map: Record<string, string> = {}
  if (!comps?.length) return map

  // Clona para um projeto novo com o código original (sem prefixo por projeto
  // — mecanismo removido, codigo_original só é mantido como metadado).
  // custo_unitario/calculado_em vêm junto para não invalidar o cache do motor
  // de cálculo (senão toda composição fica "suja" e força recálculo completo
  // no próximo ciclo, mesmo com insumos idênticos aos da origem).
  const { data: inserted, error } = await sb
    .from('orcamento_composicoes')
    .insert(comps.map((c: any) => ({
      orcamento_id: toId,
      codigo: c.codigo_original ?? c.codigo,
      descricao: c.descricao,
      unidade: c.unidade,
      base: c.base,
      custo_unitario: c.custo_unitario,
      calculado_em: c.calculado_em,
    })))
    .select('id')

  if (error) { console.error('[dup] composicoes:', error); return map }
  comps.forEach((c: any, i: number) => { if (inserted?.[i]) map[c.id] = inserted[i].id })
  return map
}

async function clonarInsumos(
  sb: any,
  fromId: string,
  toId: string,
  compIdMap: Record<string, string>
): Promise<void> {
  const { data: insumos, error } = await sb
    .from('orcamento_insumos')
    .select('codigo, codigo_original, descricao, unidade, custo, indice, grupo, base, data_ref, composicao_id, estimado, estimado_motivo')
    .eq('orcamento_id', fromId)

  if (error) console.error('[dup] insumos fetch:', error)
  if (!insumos?.length) return

  // Mesmo raciocínio de clonarComposicoes: código original, sem prefixo.
  const rows = insumos.map((i: any) => ({
    orcamento_id: toId,
    codigo: i.codigo_original ?? i.codigo,
    descricao: i.descricao,
    unidade: i.unidade,
    custo: i.custo,
    indice: i.indice ?? 1,
    grupo: i.grupo,
    base: i.base,
    data_ref: i.data_ref,
    composicao_id: i.composicao_id ? (compIdMap[i.composicao_id] ?? null) : null,
    estimado: i.estimado ?? false,
    estimado_motivo: i.estimado_motivo ?? null,
  }))

  const erros = await Promise.all(chunk(rows, 500).map(l => sb.from('orcamento_insumos').insert(l)))
  erros.forEach(({ error: e }: any) => { if (e) console.error('[dup] insumos insert:', e) })
}

/**
 * Clona a estrutura de levantamento (áreas + checklist) — status resetado
 * para 'nao_iniciado', datas para null e itens para concluido=false: uma
 * cópia/orçamento novo a partir de modelo não deve herdar progresso de
 * execução de outra obra, só a lista de áreas/itens em si. Pendências NÃO
 * são clonadas — são da execução real, não fazem parte da "estrutura".
 */
async function clonarLevantamentos(sb: any, fromId: string, toId: string): Promise<void> {
  const { data: levantamentos } = await sb
    .from('orcamento_levantamentos')
    .select('id, nome, ordem')
    .eq('orcamento_id', fromId)
    .order('ordem')

  if (!levantamentos?.length) return

  const { data: inserted, error } = await sb
    .from('orcamento_levantamentos')
    .insert(levantamentos.map((l: any) => ({ orcamento_id: toId, nome: l.nome, ordem: l.ordem })))
    .select('id')

  if (error) { console.error('[dup] levantamentos:', error); return }
  const idMap: Record<string, string> = {}
  levantamentos.forEach((l: any, i: number) => { if (inserted?.[i]) idMap[l.id] = inserted[i].id })

  const { data: itens } = await sb
    .from('orcamento_levantamento_itens')
    .select('levantamento_id, descricao, ordem')
    .in('levantamento_id', levantamentos.map((l: any) => l.id))

  if (!itens?.length) return
  const rows = itens
    .filter((it: any) => idMap[it.levantamento_id])
    .map((it: any) => ({ levantamento_id: idMap[it.levantamento_id], descricao: it.descricao, ordem: it.ordem }))

  const { error: itensErr } = await sb.from('orcamento_levantamento_itens').insert(rows)
  if (itensErr) console.error('[dup] levantamento_itens:', itensErr)
}

async function clonarTaxaAdministracaoItens(sb: any, fromId: string, toId: string): Promise<void> {
  const { data: itens } = await sb
    .from('orcamento_taxa_administracao_itens')
    .select('descricao, percentual, ordem')
    .eq('orcamento_id', fromId)
    .order('ordem')
  if (!itens?.length) return

  const { error } = await sb
    .from('orcamento_taxa_administracao_itens')
    .insert(itens.map((it: any) => ({ orcamento_id: toId, descricao: it.descricao, percentual: it.percentual, ordem: it.ordem })))
  if (error) console.error('[dup] taxa_administracao_itens:', error)
}

async function clonarServicosEstimados(sb: any, fromId: string, toId: string): Promise<void> {
  const { data: servicos } = await sb
    .from('orcamento_servicos_estimados')
    .select('descricao, valor, ordem')
    .eq('orcamento_id', fromId)
    .order('ordem')
  if (!servicos?.length) return

  const { error } = await sb
    .from('orcamento_servicos_estimados')
    .insert(servicos.map((s: any) => ({ orcamento_id: toId, descricao: s.descricao, valor: s.valor, ordem: s.ordem })))
  if (error) console.error('[dup] servicos_estimados:', error)
}

async function clonarPavimentos(sb: any, fromId: string, toId: string): Promise<void> {
  const { data: pavimentos } = await sb
    .from('orcamento_pavimentos')
    .select('descricao, unidade, area_total, area_equivalente, area_coberta, ordem')
    .eq('orcamento_id', fromId)
    .order('ordem')
  if (!pavimentos?.length) return

  const { error } = await sb
    .from('orcamento_pavimentos')
    .insert(pavimentos.map((p: any) => ({
      orcamento_id: toId, descricao: p.descricao, unidade: p.unidade,
      area_total: p.area_total, area_equivalente: p.area_equivalente, area_coberta: p.area_coberta, ordem: p.ordem,
    })))
  if (error) console.error('[dup] pavimentos:', error)
}

export type DuplicateResult = {
  id: string
  nome_obra: string
  cliente: string | null
  data: string
  bdi_global: number
  modelo_acrescimo: ModeloAcrescimo
  codigo: string | null
  ultimo_acesso: string | null
  itemCount: number
}

/**
 * Pipeline de clonagem de conteúdo — planilhas, estrutura, itens legados,
 * composições, insumos, levantamentos, taxa de administração, serviços
 * estimados e pavimentos — de um orçamento pra outro. Único pipeline de
 * clonagem do sistema (antes havia um segundo, parcial, em versoes.ts —
 * capturarSnapshot/aplicarSnapshot; este aqui passou a cobrir a união
 * completa das duas listas, ver auditoria de revisões). Compartilhado entre
 * duplicarOrcamento, criarOrcamentoAPartirDeModelo e criarRevisao. `toId` já
 * precisa existir em tabela_orcamentos.
 *
 * Deliberadamente NÃO clona orcamento_insumo_cotacoes (histórico de
 * negociação/fornecedor, não estado do orçamento) nem historico_alteracoes
 * (o log de auditoria de uma cópia nova começa vazio, por design).
 */
async function clonarConteudo(sb: any, fromId: string, toId: string): Promise<void> {
  // Planilhas precisa vir antes da estrutura (a estrutura remapeia planilha_id).
  // Itens e composições em paralelo com a estrutura — insumos depois (precisa do compIdMap)
  const planilhaIdMap = await clonarPlanilhas(sb, fromId, toId)
  const [, , compIdMap] = await Promise.all([
    clonarEstrutura(sb, fromId, toId, planilhaIdMap),
    clonarItens(sb, fromId, toId),
    clonarComposicoes(sb, fromId, toId),
    clonarLevantamentos(sb, fromId, toId),
    clonarTaxaAdministracaoItens(sb, fromId, toId),
    clonarServicosEstimados(sb, fromId, toId),
    clonarPavimentos(sb, fromId, toId),
  ])
  await clonarInsumos(sb, fromId, toId, compIdMap)
}

export async function duplicarOrcamento(
  sb: any,
  userId: string,
  orcamentoId: string,
  novoCodigo: string
): Promise<DuplicateResult> {
  const { data: orig, error: errOrig } = await sb
    .from('tabela_orcamentos')
    .select('nome_obra, cliente, data, bdi_global, modelo_acrescimo, tabela_itens_orcamento(id)')
    .eq('id', orcamentoId)
    .single()

  if (errOrig || !orig) throw new Error(`Orçamento não encontrado: ${errOrig?.message ?? ''}`)

  const { id: novoId, nome_obra: nomeNovo } = await criarNovoOrcamento(sb, userId, orig, novoCodigo)
  await clonarConteudo(sb, orcamentoId, novoId)

  return {
    id: novoId,
    nome_obra: nomeNovo,
    cliente: orig.cliente ?? null,
    data: orig.data,
    bdi_global: orig.bdi_global,
    modelo_acrescimo: orig.modelo_acrescimo,
    codigo: novoCodigo,
    ultimo_acesso: null,
    itemCount: (orig.tabela_itens_orcamento as any[])?.length ?? 0,
  }
}

export type DadosNovoOrcamentoDeModelo = {
  nome_obra: string
  cliente: string | null
  data: string
  bdi_global: number
  modelo_acrescimo: ModeloAcrescimo
  taxa_administracao_itens: TaxaAdministracaoItem[]
  codigo: string
}

/**
 * Cria um orçamento real a partir de um modelo (orçamento com is_modelo=true):
 * metadados (nome/cliente/data/BDI/código) vêm do formulário de criação, só a
 * estrutura (planilhas, itens, composições, insumos) é clonada do modelo —
 * mesmo pipeline de duplicarOrcamento, mas sem herdar nome/cliente/data do
 * modelo (que não fazem sentido pra um projeto real).
 */
export async function criarOrcamentoAPartirDeModelo(
  sb: any,
  userId: string,
  modeloId: string,
  dados: DadosNovoOrcamentoDeModelo
): Promise<DuplicateResult> {
  const { data: modelo, error: errModelo } = await sb
    .from('tabela_orcamentos')
    .select('id, is_modelo')
    .eq('id', modeloId)
    .single()

  if (errModelo || !modelo) throw new Error(`Modelo não encontrado: ${errModelo?.message ?? ''}`)
  if (!modelo.is_modelo) throw new Error('Este orçamento não é um modelo.')

  const { data, error } = await sb
    .from('tabela_orcamentos')
    .insert({
      user_id: userId,
      nome_obra: dados.nome_obra,
      cliente: dados.cliente,
      data: dados.data,
      bdi_global: dados.bdi_global,
      codigo: dados.codigo,
      is_modelo: false,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Erro ao criar orçamento: ${error.message}`)

  const novoId = data.id
  await clonarConteudo(sb, modeloId, novoId)

  // Conteúdo clonado traz bdi_global/bdi_especifico e possíveis subgrupos de
  // Taxa de Administração do MODELO — sem os passos abaixo, as escolhas do
  // formulário de criação não seriam respeitadas pelo conteúdo recém-copiado.
  await salvarTaxaAdministracaoItens(sb, novoId, dados.taxa_administracao_itens)
  await aplicarModeloAcrescimo(sb, novoId, dados.modelo_acrescimo, dados.bdi_global)

  const { data: planilhasNovas } = await sb.from('orcamento_planilhas').select('id').eq('orcamento_id', novoId)
  if (planilhasNovas?.length) {
    await persistirTotaisPlanilha(sb, novoId, planilhasNovas.map((p: { id: string }) => p.id))
  }

  return {
    id: novoId,
    nome_obra: dados.nome_obra,
    cliente: dados.cliente,
    data: dados.data,
    bdi_global: dados.bdi_global,
    modelo_acrescimo: dados.modelo_acrescimo,
    codigo: dados.codigo,
    ultimo_acesso: null,
    itemCount: 0,
  }
}

export type RevisaoResult = {
  id: string
  nome_obra: string
  numero_revisao: number
  grupo_id: string
}

/**
 * Cria uma nova revisão a partir de um orçamento existente: cópia completa e
 * independente (mesmo pipeline de clonagem de duplicarOrcamento — nenhum
 * dado editável é compartilhado com a origem, cada linha nasce com id novo),
 * mas pertencendo à MESMA família (grupo_id) da origem, com numero_revisao
 * seguinte.
 *
 * Diferente de duplicarOrcamento (gera "Cópia de X", um projeto novo e sem
 * relação nenhuma com o original) — aqui nome/código/cliente/áreas/numeração
 * permanecem idênticos à origem, porque é a MESMA obra, só uma revisão nova
 * dela. O usuário edita a partir daí sem afetar nenhuma outra revisão.
 */
export async function criarRevisao(
  sb: any,
  userId: string,
  userEmail: string | null,
  orcamentoOrigemId: string,
): Promise<RevisaoResult> {
  const { data: orig, error: errOrig } = await sb
    .from('tabela_orcamentos')
    .select('nome_obra, cliente, data, bdi_global, modelo_acrescimo, codigo, grupo_id, area_total, area_coberta, area_equivalente, local, numeracao_digitos, categorias_grafico')
    .eq('id', orcamentoOrigemId)
    .single()
  if (errOrig || !orig) throw new Error(`Orçamento não encontrado: ${errOrig?.message ?? ''}`)

  const grupoId = orig.grupo_id ?? orcamentoOrigemId

  const { data: irmaos, error: errIrmaos } = await sb
    .from('tabela_orcamentos')
    .select('numero_revisao')
    .eq('grupo_id', grupoId)
    .order('numero_revisao', { ascending: false })
    .limit(1)
  if (errIrmaos) throw new Error(`Erro ao verificar revisões existentes: ${errIrmaos.message}`)
  const proximoNumero = (irmaos?.[0]?.numero_revisao ?? 0) + 1

  const { data: novo, error: novoErr } = await sb
    .from('tabela_orcamentos')
    .insert({
      user_id: userId,
      nome_obra: orig.nome_obra,
      cliente: orig.cliente,
      data: orig.data,
      bdi_global: orig.bdi_global,
      modelo_acrescimo: orig.modelo_acrescimo,
      codigo: orig.codigo,
      grupo_id: grupoId,
      numero_revisao: proximoNumero,
      origem_orcamento_id: orcamentoOrigemId,
      criado_por_email: userEmail,
      area_total: orig.area_total,
      area_coberta: orig.area_coberta,
      area_equivalente: orig.area_equivalente,
      local: orig.local,
      numeracao_digitos: orig.numeracao_digitos,
      categorias_grafico: orig.categorias_grafico,
    })
    .select('id')
    .single()
  if (novoErr) throw new Error(`Erro ao criar revisão: ${novoErr.message}`)
  const novoId = novo.id as string

  try {
    await clonarConteudo(sb, orcamentoOrigemId, novoId)

    const { data: planilhasNovas } = await sb.from('orcamento_planilhas').select('id').eq('orcamento_id', novoId)
    if (planilhasNovas?.length) {
      await persistirTotaisPlanilha(sb, novoId, planilhasNovas.map((p: { id: string }) => p.id))
    }
  } catch (e) {
    // Sem transação de banco cobrindo os passos acima — uma falha no meio do
    // clone não pode deixar uma revisão pela metade na lista: apaga o que foi
    // criado (cascade cuida de planilhas/estrutura/composições/insumos já
    // inseridos). Mesma rede de segurança de criarOrcamentoDeVersao.
    await sb.from('tabela_orcamentos').delete().eq('id', novoId)
    throw e
  }

  return { id: novoId, nome_obra: orig.nome_obra, numero_revisao: proximoNumero, grupo_id: grupoId }
}
