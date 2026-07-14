'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { salvarConfigNumeracao } from '../planilha/planilha-action'
import { salvarDadosCadastrais } from '@/lib/orcamento/dados-cadastrais'
import { registrarHistorico } from '@/lib/log'

export interface ConfigOrcamentoInput {
  nome_obra: string
  codigo: string | null
  cliente: string | null
  local: string | null
  data: string
  bdi_global: number
  area_total: number | null
  area_coberta: number | null
  area_equivalente: number | null
  numeracao_digitos: number[]
  servicos_estimados: { descricao: string; valor: number }[]
  categorias_grafico: Record<string, string>
}

export async function salvarConfiguracoes(orcamentoId: string, input: ConfigOrcamentoInput): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any

  const { data: anterior } = await sb
    .from('tabela_orcamentos')
    .select('nome_obra, codigo, cliente, local, data, bdi_global, area_total, area_coberta, area_equivalente')
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

  // Campos exclusivos de Configurações (não fazem parte do helper compartilhado
  // com a aba Relatórios/Caderno): BDI global e distribuição de custos.
  const { error } = await sb
    .from('tabela_orcamentos')
    .update({ bdi_global: input.bdi_global, categorias_grafico: input.categorias_grafico })
    .eq('id', orcamentoId)
  if (error) throw new Error(`Erro ao salvar dados do orçamento: ${error.message}`)

  // Propaga o BDI global para todas as planilhas do orçamento
  await sb
    .from('orcamento_planilhas')
    .update({ bdi_global: input.bdi_global })
    .eq('orcamento_id', orcamentoId)

  await salvarConfigNumeracao(orcamentoId, input.numeracao_digitos)

  revalidatePath(`/orcamentos/${orcamentoId}/configuracoes`)
  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  revalidatePath(`/orcamentos/${orcamentoId}/relatorios`)
  revalidatePath(`/orcamentos/${orcamentoId}/editar`)
  revalidatePath('/orcamentos')

  const camposNovos = {
    nome_obra: input.nome_obra, codigo: input.codigo, cliente: input.cliente, local: input.local,
    data: input.data, bdi_global: input.bdi_global, area_total: input.area_total,
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
