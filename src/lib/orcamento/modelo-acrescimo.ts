import type { SupabaseClient } from '@supabase/supabase-js'

export type ModeloAcrescimo = 'sem_taxa' | 'taxa_administracao' | 'bdi'

export interface TaxaAdministracaoItem {
  id?: string
  descricao: string
  percentual: number
}

/**
 * BDI efetivo pra um modelo de acréscimo: fora do modo 'bdi' o acréscimo via
 * multiplicador é sempre zero — 'sem_taxa' porque não deve haver nenhum,
 * 'taxa_administracao' porque o acréscimo vira um GRUPO de itens na própria
 * planilha (ver sincronizarItensTaxaAdministracao), não um multiplicador por
 * cima do total. A fórmula de cálculo (custo × (1 + bdi/100)) continua a
 * mesma em todo lugar — só o valor de entrada muda.
 */
export function bdiEfetivo(modelo: ModeloAcrescimo, bdiDigitado: number): number {
  return modelo === 'bdi' ? bdiDigitado : 0
}

/**
 * Lista de subgrupos configurados da Taxa de Administração (Configurações) —
 * cada um vira um item-filho do grupo auto-gerenciado na planilha, todos
 * aplicando seu percentual sobre a MESMA base (soma dos demais itens do
 * projeto). Fonte de verdade única: orcamento_taxa_administracao_itens.
 */
export async function getTaxaAdministracaoItens(
  sb: SupabaseClient,
  orcamentoId: string
): Promise<TaxaAdministracaoItem[]> {
  const { data, error } = await (sb as any)
    .from('orcamento_taxa_administracao_itens')
    .select('id, descricao, percentual')
    .eq('orcamento_id', orcamentoId)
    .order('ordem', { ascending: true })
  if (error) throw new Error(`Erro ao buscar subgrupos de Taxa de Administração: ${error.message}`)
  return data ?? []
}

/**
 * Substitui a lista inteira de subgrupos — mesmo padrão "delete tudo +
 * reinsere" já usado pra orcamento_pavimentos/orcamento_servicos_estimados
 * (ver salvarPavimentos). Não sincroniza a planilha sozinha: quem chama é
 * responsável por rodar sincronizarItensTaxaAdministracao/
 * persistirTotaisPlanilha depois, se quiser refletir a mudança na hora.
 */
export async function salvarTaxaAdministracaoItens(
  sb: SupabaseClient,
  orcamentoId: string,
  itens: TaxaAdministracaoItem[]
): Promise<void> {
  const sbAny = sb as any

  const { error: delError } = await sbAny.from('orcamento_taxa_administracao_itens').delete().eq('orcamento_id', orcamentoId)
  if (delError) throw new Error(`Erro ao salvar subgrupos de Taxa de Administração: ${delError.message}`)

  if (itens.length === 0) return

  const { error: insError } = await sbAny.from('orcamento_taxa_administracao_itens').insert(
    itens.map((it, i) => ({ orcamento_id: orcamentoId, descricao: it.descricao, percentual: it.percentual, ordem: i }))
  )
  if (insError) throw new Error(`Erro ao salvar subgrupos de Taxa de Administração: ${insError.message}`)
}

/**
 * Garante que a planilha tenha o GRUPO "Taxa de Administração" (criando-o
 * como primeiro item de primeiro nível se ainda não existir — desloca os
 * demais itens/grupos de primeiro nível em +1 na ordem, mesmo mecanismo de
 * "inserir numa posição" de adicionarItemNaPosicao). Índice único em
 * orcamento_estrutura(planilha_id) WHERE eh_taxa_administracao AND tipo =
 * 'grupo' garante no máximo 1 por planilha. Retorna o id do grupo.
 */
async function garantirGrupoTaxaAdministracao(sb: any, orcamentoId: string, planilhaId: string): Promise<{ id: string; nivel: number }> {
  const { data: existente } = await sb
    .from('orcamento_estrutura')
    .select('id, nivel')
    .eq('planilha_id', planilhaId)
    .eq('eh_taxa_administracao', true)
    .eq('tipo', 'grupo')
    .maybeSingle()
  if (existente) return existente

  const { data: raizAtuais } = await sb
    .from('orcamento_estrutura')
    .select('id, ordem')
    .eq('planilha_id', planilhaId)
    .is('parent_id', null)
  if (raizAtuais?.length) {
    await Promise.all(
      (raizAtuais as { id: string; ordem: number }[]).map((r) =>
        sb.from('orcamento_estrutura').update({ ordem: r.ordem + 1 }).eq('id', r.id)
      )
    )
  }

  const { data: novo, error } = await sb
    .from('orcamento_estrutura')
    .insert({
      orcamento_id: orcamentoId,
      planilha_id: planilhaId,
      parent_id: null,
      numero: '', // renumerado automaticamente no próximo load da planilha (atribuirNumeros)
      nivel: 1,
      codigo: null,
      descricao: 'Taxa de Administração',
      unidade: null,
      quantidade: null,
      custo_unitario: null,
      bdi_especifico: null,
      tipo: 'grupo',
      ordem: 0,
      eh_taxa_administracao: true,
    })
    .select('id, nivel')
    .single()
  if (error) throw new Error(`Erro ao criar grupo de Taxa de Administração: ${error.message}`)
  return novo
}

/**
 * Mantém o GRUPO "Taxa de Administração" de cada planilha em dia: recria seus
 * filhos do zero a partir da lista de subgrupos configurada — mais simples e
 * robusto que diffar por descrição/posição, já que o subtree inteiro é
 * auto-gerenciado (nenhuma edição manual de filho sobrevive de qualquer
 * forma, ver editableFields em planilha-tree.ts). Cada filho vale
 * percentual% do custo de TODOS os demais itens da planilha (nunca inclui
 * itens do próprio grupo na base — evitaria autorreferência). Chamada a
 * partir de persistirTotaisPlanilha (motor-calculo.ts) antes de somar os
 * totais, então roda em toda edição de item — sempre em dia.
 */
export async function sincronizarItensTaxaAdministracao(
  sb: SupabaseClient,
  orcamentoId: string,
  planilhaIds: string[],
  itens: TaxaAdministracaoItem[]
): Promise<void> {
  const sbAny = sb as any
  for (const planilhaId of planilhaIds) {
    const grupo = await garantirGrupoTaxaAdministracao(sbAny, orcamentoId, planilhaId)

    // Só apaga filhos que ELE MESMO criou (eh_taxa_administracao=true) — um
    // item que o usuário tenha arrastado/inserido manualmente para dentro do
    // grupo (via drag-and-drop ou "adicionar sub-item") não é tocado aqui,
    // pra nunca apagar silenciosamente algo que não foi este sync que criou.
    const { error: delErr } = await sbAny
      .from('orcamento_estrutura')
      .delete()
      .eq('parent_id', grupo.id)
      .eq('eh_taxa_administracao', true)
    if (delErr) throw new Error(`Erro ao limpar subgrupos de Taxa de Administração: ${delErr.message}`)

    if (itens.length === 0) continue

    // Base do cálculo: todo item 'item' da planilha, incluindo qualquer item
    // "estranho" que tenha ficado dentro do grupo (ver comentário acima) —
    // ele continua sendo um custo real do projeto, só não teve sua descrição/
    // valor definidos por aqui.
    const { data: outros } = await sbAny
      .from('orcamento_estrutura')
      .select('custo_unitario, quantidade')
      .eq('orcamento_id', orcamentoId)
      .eq('planilha_id', planilhaId)
      .eq('tipo', 'item')

    const totalSemTaxa = ((outros ?? []) as { custo_unitario: number | null; quantidade: number | null }[])
      .reduce((acc, i) => acc + (i.custo_unitario ?? 0) * (i.quantidade ?? 0), 0)

    const { error: insErr } = await sbAny.from('orcamento_estrutura').insert(
      itens.map((it, idx) => ({
        orcamento_id: orcamentoId,
        planilha_id: planilhaId,
        parent_id: grupo.id,
        numero: '',
        nivel: grupo.nivel + 1,
        codigo: null,
        descricao: it.descricao,
        unidade: 'VB',
        quantidade: 1,
        custo_unitario: Math.max(0, (it.percentual / 100) * totalSemTaxa),
        bdi_especifico: null,
        tipo: 'item',
        ordem: idx,
        eh_taxa_administracao: true,
      }))
    )
    if (insErr) throw new Error(`Erro ao criar subgrupos de Taxa de Administração: ${insErr.message}`)
  }
}

/**
 * Aplica um modelo de acréscimo a um orçamento que já tem planilhas/itens
 * (criação a partir de modelo, edição em Configurações, ou restauração de
 * versão). Fora do modo 'bdi', zera bdi_global em todas as planilhas do
 * orçamento e limpa bdi_especifico de todo item — sem isso, um override de
 * item sobrevivendo à troca de modo reintroduziria um acréscimo escondido em
 * "Sem taxa"/"Taxa de Administração". No modo 'taxa_administracao', lê a
 * lista de subgrupos JÁ SALVA (getTaxaAdministracaoItens — quem quiser mudar
 * a lista chama salvarTaxaAdministracaoItens ANTES desta função) e
 * sincroniza o grupo auto-gerenciado em cada planilha; ao SAIR desse modo, o
 * grupo e os itens já criados não são apagados — só perdem a flag
 * eh_taxa_administracao e viram um grupo/itens comuns, editáveis como
 * qualquer outro (decisão explícita: o usuário pode querer manter/ajustar
 * aqueles valores manualmente).
 *
 * Não chama persistirTotaisPlanilha — quem chama esta função é responsável
 * por recalcular os totais persistidos depois (evita import circular com
 * motor-calculo.ts, que já chama sincronizarItensTaxaAdministracao acima
 * internamente a cada recálculo).
 */
export async function aplicarModeloAcrescimo(
  sb: SupabaseClient,
  orcamentoId: string,
  modelo: ModeloAcrescimo,
  bdiDigitado: number
): Promise<void> {
  const sbAny = sb as any
  const bdi = bdiEfetivo(modelo, bdiDigitado)

  const { error: errOrc } = await sbAny
    .from('tabela_orcamentos')
    .update({ modelo_acrescimo: modelo, bdi_global: bdi })
    .eq('id', orcamentoId)
  if (errOrc) throw new Error(`Erro ao salvar modelo de acréscimo: ${errOrc.message}`)

  const { error: errPlan } = await sbAny
    .from('orcamento_planilhas')
    .update({ bdi_global: bdi })
    .eq('orcamento_id', orcamentoId)
  if (errPlan) throw new Error(`Erro ao propagar BDI para as planilhas: ${errPlan.message}`)

  if (modelo !== 'bdi') {
    const { error: errEstrutura } = await sbAny
      .from('orcamento_estrutura')
      .update({ bdi_especifico: null })
      .eq('orcamento_id', orcamentoId)
      .eq('tipo', 'item')
    if (errEstrutura) throw new Error(`Erro ao limpar BDI específico dos itens: ${errEstrutura.message}`)
  }

  if (modelo === 'taxa_administracao') {
    const itens = await getTaxaAdministracaoItens(sb, orcamentoId)
    const { data: planilhas } = await sbAny.from('orcamento_planilhas').select('id').eq('orcamento_id', orcamentoId)
    const planilhaIds = ((planilhas ?? []) as { id: string }[]).map((p) => p.id)
    if (planilhaIds.length) await sincronizarItensTaxaAdministracao(sb, orcamentoId, planilhaIds, itens)
  } else {
    const { error: errDesmarcar } = await sbAny
      .from('orcamento_estrutura')
      .update({ eh_taxa_administracao: false })
      .eq('orcamento_id', orcamentoId)
      .eq('eh_taxa_administracao', true)
    if (errDesmarcar) throw new Error(`Erro ao liberar grupo/itens de Taxa de Administração: ${errDesmarcar.message}`)
  }
}
