'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { salvarConfigNumeracao } from '../planilha/planilha-numeracao-action'
import { salvarDadosCadastrais } from '@/lib/orcamento/dados-cadastrais'
import { salvarPavimentos, type OrcamentoPavimento } from '@/lib/orcamento/pavimentos'
import { registrarHistorico } from '@/lib/log'
import { aplicarModeloAcrescimo, bdiEfetivo, getTaxaAdministracaoItens, salvarTaxaAdministracaoItens, type ModeloAcrescimo, type TaxaAdministracaoItem } from '@/lib/orcamento/modelo-acrescimo'
import { persistirTotaisPlanilha } from '@/lib/orcamento/motor-calculo'
import type { CategoriaResumoGrupo } from '@/lib/orcamento/categorias-resumo'

function taxaItensIguais(a: TaxaAdministracaoItem[], b: TaxaAdministracaoItem[]): boolean {
  if (a.length !== b.length) return false
  return a.every((item, i) => item.descricao === b[i].descricao && item.percentual === b[i].percentual)
}

export interface ConfigOrcamentoInput {
  nome_obra: string
  codigo: string | null
  cliente: string | null
  local: string | null
  data: string
  bdi_global: number
  modelo_acrescimo: ModeloAcrescimo
  taxa_administracao_itens: TaxaAdministracaoItem[]
  area_total: number | null
  area_coberta: number | null
  area_equivalente: number | null
  numeracao_digitos: number[]
  servicos_estimados: { descricao: string; valor: number }[]
  categorias_grafico: Record<string, string>
  categorias_resumo: CategoriaResumoGrupo[]
  pavimentos: OrcamentoPavimento[]
}

export async function salvarConfiguracoes(orcamentoId: string, input: ConfigOrcamentoInput): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any

  const [{ data: anterior }, taxaItensAtuais] = await Promise.all([
    sb
      .from('tabela_orcamentos')
      .select('nome_obra, codigo, cliente, local, data, bdi_global, modelo_acrescimo, area_total, area_coberta, area_equivalente, numeracao_digitos')
      .eq('id', orcamentoId)
      .single(),
    // Lido ANTES de salvarTaxaAdministracaoItens sobrescrever — é o que
    // determina se aplicarModeloAcrescimo/persistirTotaisPlanilha abaixo
    // precisam rodar de novo (ver acrescimoMudou).
    getTaxaAdministracaoItens(supabase, orcamentoId),
  ])

  await salvarDadosCadastrais(supabase, orcamentoId, {
    nome_obra: input.nome_obra,
    codigo: input.codigo,
    cliente: input.cliente,
    local: input.local,
    data: input.data,
    area_total: input.area_total,
    area_coberta: input.area_coberta,
    area_equivalente: input.area_equivalente,
    servicos_estimados: input.servicos_estimados,
  })

  // Campos exclusivos de Configurações (não fazem parte do helper
  // compartilhado com a aba Relatórios/Caderno): distribuição de custos
  // (gráfico) e categorias de agrupamento do Resumo Geral.
  const { error } = await sb
    .from('tabela_orcamentos')
    .update({ categorias_grafico: input.categorias_grafico, categorias_resumo: input.categorias_resumo })
    .eq('id', orcamentoId)
  if (error) throw new Error(`Erro ao salvar dados do orçamento: ${error.message}`)

  // Lista de subgrupos precisa estar salva ANTES de aplicarModeloAcrescimo —
  // ele lê o estado atual da tabela pra sincronizar o grupo da planilha.
  await salvarTaxaAdministracaoItens(supabase, orcamentoId, input.taxa_administracao_itens)

  // Só recalcula acréscimo/totais quando modelo, BDI ou os subgrupos de Taxa
  // de Administração realmente mudaram — nenhum outro campo de
  // Configurações afeta custo_unitario/quantidade/bdi_especifico dos itens,
  // então aplicarModeloAcrescimo + persistirTotaisPlanilha (recalcula TODOS
  // os itens de TODAS as planilhas) sempre rodavam mesmo pra um save que só
  // mudou, por exemplo, o campo "Local" — o gargalo real de performance
  // aqui (junto com a renumeração abaixo).
  const bdiNovo = bdiEfetivo(input.modelo_acrescimo, input.bdi_global)
  const acrescimoMudou = !anterior
    || anterior.modelo_acrescimo !== input.modelo_acrescimo
    || anterior.bdi_global !== bdiNovo
    || (input.modelo_acrescimo === 'taxa_administracao' && !taxaItensIguais(taxaItensAtuais, input.taxa_administracao_itens))

  if (acrescimoMudou) {
    // Modelo de acréscimo (Sem taxa / Taxa de Administração / BDI): grava
    // bdi_global no orçamento e propaga pras planilhas, zerando bdi_especifico
    // dos itens (fora do modo BDI) e garantindo/sincronizando o grupo "Taxa de
    // Administração" em cada planilha (no modo Taxa de Administração) — ver
    // src/lib/orcamento/modelo-acrescimo.ts.
    await aplicarModeloAcrescimo(supabase, orcamentoId, input.modelo_acrescimo, input.bdi_global)

    const { data: planilhasParaRecalcular } = await sb.from('orcamento_planilhas').select('id').eq('orcamento_id', orcamentoId)
    if (planilhasParaRecalcular?.length) {
      await persistirTotaisPlanilha(supabase, orcamentoId, planilhasParaRecalcular.map((p: { id: string }) => p.id))
    }
  }

  // Renumerar reatribui numero/nivel de TODA a EAP do orçamento (via RPC em
  // massa — ver salvarNumeros — mas ainda assim busca a árvore inteira) —
  // só vale a pena quando a config de níveis/dígitos em si mudou.
  const numeracaoMudou = !anterior || JSON.stringify(anterior.numeracao_digitos ?? []) !== JSON.stringify(input.numeracao_digitos)
  if (numeracaoMudou) {
    await salvarConfigNumeracao(orcamentoId, input.numeracao_digitos)
  }

  await salvarPavimentos(supabase, orcamentoId, input.pavimentos)

  revalidatePath(`/orcamentos/${orcamentoId}/configuracoes`)
  revalidatePath(`/orcamentos/${orcamentoId}/caderno`)
  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  revalidatePath(`/orcamentos/${orcamentoId}/relatorios`)
  revalidatePath(`/orcamentos/${orcamentoId}/editar`)
  revalidatePath('/orcamentos')

  const camposNovos = {
    nome_obra: input.nome_obra, codigo: input.codigo, cliente: input.cliente, local: input.local,
    data: input.data, bdi_global: bdiEfetivo(input.modelo_acrescimo, input.bdi_global),
    modelo_acrescimo: input.modelo_acrescimo, area_total: input.area_total,
    area_coberta: input.area_coberta, area_equivalente: input.area_equivalente,
  }
  const mudou = anterior && Object.keys(camposNovos).some(
    k => (anterior as any)[k] !== (camposNovos as any)[k]
  )

  registrarHistorico(supabase, {
    orcamentoId,
    entidade: 'orcamento',
    tipo: 'sucesso',
    acao: 'salvar_configuracoes',
    mensagem: `Configurações do orçamento "${input.nome_obra}" salvas`,
    valorAnterior: mudou ? anterior : undefined,
    valorNovo: mudou ? camposNovos : undefined,
  }).catch(console.error)
}
