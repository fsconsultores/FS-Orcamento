'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { salvarConfigNumeracao } from '../planilha/planilha-action'
import { logAction } from '@/lib/log'

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

  const { error } = await sb
    .from('tabela_orcamentos')
    .update({
      nome_obra: input.nome_obra,
      codigo: input.codigo,
      cliente: input.cliente,
      local: input.local,
      data: input.data,
      bdi_global: input.bdi_global,
      area_total: input.area_total,
      area_coberta: input.area_coberta,
      area_equivalente: input.area_equivalente,
      categorias_grafico: input.categorias_grafico,
    })
    .eq('id', orcamentoId)
  if (error) throw new Error(`Erro ao salvar dados do orçamento: ${error.message}`)

  const { error: delError } = await sb.from('orcamento_servicos_estimados').delete().eq('orcamento_id', orcamentoId)
  if (delError) throw new Error(`Erro ao salvar serviços estimados: ${delError.message}`)

  if (input.servicos_estimados.length > 0) {
    const { error: insError } = await sb.from('orcamento_servicos_estimados').insert(
      input.servicos_estimados.map((s, i) => ({ orcamento_id: orcamentoId, descricao: s.descricao, valor: s.valor, ordem: i }))
    )
    if (insError) throw new Error(`Erro ao salvar serviços estimados: ${insError.message}`)
  }

  await salvarConfigNumeracao(orcamentoId, input.numeracao_digitos)

  revalidatePath(`/orcamentos/${orcamentoId}/configuracoes`)
  revalidatePath(`/orcamentos/${orcamentoId}/editar`)
  revalidatePath('/orcamentos')

  const { data: authData } = await supabase.auth.getUser()
  logAction(supabase, {
    usuario: authData?.user?.email ?? '',
    tipo: 'sucesso',
    acao: 'salvar_configuracoes',
    mensagem: `Configurações do orçamento "${input.nome_obra}" salvas`,
    contexto: { orcamento_id: orcamentoId },
  }).catch(console.error)
}
