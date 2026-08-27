'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { salvarConfigNumeracao } from '../planilha/planilha-numeracao-action'
import { salvarDadosCadastrais } from '@/lib/orcamento/dados-cadastrais'
import { salvarPavimentos, type OrcamentoPavimento } from '@/lib/orcamento/pavimentos'
import { registrarHistorico } from '@/lib/log'
import { aplicarModeloAcrescimo, bdiEfetivo, salvarTaxaAdministracaoItens, type ModeloAcrescimo, type TaxaAdministracaoItem } from '@/lib/orcamento/modelo-acrescimo'
import { persistirTotaisPlanilha } from '@/lib/orcamento/motor-calculo'

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
  pavimentos: OrcamentoPavimento[]
}

export async function salvarConfiguracoes(orcamentoId: string, input: ConfigOrcamentoInput): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any

  const { data: anterior } = await sb
    .from('tabela_orcamentos')
    .select('nome_obra, codigo, cliente, local, data, bdi_global, modelo_acrescimo, area_total, area_coberta, area_equivalente')
    .eq('id', orcamentoId)
    .single()

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

  // Campo exclusivo de Configurações (não faz parte do helper compartilhado
  // com a aba Relatórios/Caderno): distribuição de custos.
  const { error } = await sb
    .from('tabela_orcamentos')
    .update({ categorias_grafico: input.categorias_grafico })
    .eq('id', orcamentoId)
  if (error) throw new Error(`Erro ao salvar dados do orçamento: ${error.message}`)

  // Lista de subgrupos precisa estar salva ANTES de aplicarModeloAcrescimo —
  // ele lê o estado atual da tabela pra sincronizar o grupo da planilha.
  await salvarTaxaAdministracaoItens(supabase, orcamentoId, input.taxa_administracao_itens)

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

  await salvarConfigNumeracao(orcamentoId, input.numeracao_digitos)
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
