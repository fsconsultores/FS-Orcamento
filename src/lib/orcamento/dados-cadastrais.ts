import type { SupabaseClient } from '@supabase/supabase-js'

export interface DadosCadastraisInput {
  nome_obra: string
  codigo: string | null
  cliente: string | null
  local: string | null
  data: string
  area_total: number | null
  area_coberta: number | null
  area_equivalente: number | null
  servicos_estimados: { descricao: string; valor: number }[]
}

/**
 * Atualiza os campos cadastrais do orçamento usados no Caderno de Orçamento
 * (nome, código, cliente, local, data, áreas) e substitui a lista de serviços
 * estimados manuais. Não mexe em bdi_global/numeracao_digitos/
 * categorias_grafico — esses são específicos da tela de Configurações
 * (ver salvarConfiguracoes em configuracoes-action.ts, que chama este helper
 * e depois cuida dos campos próprios dela).
 */
export async function salvarDadosCadastrais(
  supabase: SupabaseClient,
  orcamentoId: string,
  input: DadosCadastraisInput,
): Promise<void> {
  const sb = supabase as any

  const { error } = await sb
    .from('tabela_orcamentos')
    .update({
      nome_obra: input.nome_obra,
      codigo: input.codigo,
      cliente: input.cliente,
      local: input.local,
      data: input.data,
      area_total: input.area_total,
      area_coberta: input.area_coberta,
      area_equivalente: input.area_equivalente,
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
}
