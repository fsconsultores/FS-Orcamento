'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { salvarDadosCadastrais, type DadosCadastraisInput } from '@/lib/orcamento/dados-cadastrais'
import { registrarHistorico } from '@/lib/log'

export async function salvarInfoCadernoAction(orcamentoId: string, input: DadosCadastraisInput): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any

  const { data: anterior } = await sb
    .from('tabela_orcamentos')
    .select('nome_obra, codigo, cliente, local, data, area_total, area_coberta, area_equivalente')
    .eq('id', orcamentoId)
    .single()

  await salvarDadosCadastrais(supabase, orcamentoId, input)

  revalidatePath(`/orcamentos/${orcamentoId}/relatorios`)
  revalidatePath(`/orcamentos/${orcamentoId}/configuracoes`)
  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  revalidatePath(`/orcamentos/${orcamentoId}/editar`)
  revalidatePath('/orcamentos')

  const camposNovos = {
    nome_obra: input.nome_obra, codigo: input.codigo, cliente: input.cliente, local: input.local,
    data: input.data, area_total: input.area_total, area_coberta: input.area_coberta, area_equivalente: input.area_equivalente,
  }
  const mudou = anterior && Object.keys(camposNovos).some(
    k => (anterior as any)[k] !== (camposNovos as any)[k]
  )

  registrarHistorico(supabase, {
    orcamentoId,
    entidade: 'orcamento',
    tipo: 'sucesso',
    acao: 'salvar_configuracoes',
    mensagem: `Dados do orçamento "${input.nome_obra}" atualizados pelo Caderno de Orçamento`,
    valorAnterior: mudou ? anterior : undefined,
    valorNovo: mudou ? camposNovos : undefined,
  }).catch(console.error)
}
