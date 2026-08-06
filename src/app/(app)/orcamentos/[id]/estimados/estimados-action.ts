'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { registrarHistorico } from '@/lib/log'

export interface AlteracaoEstimado {
  id: string
  estimado: boolean
  motivo: string | null
}

/**
 * Persiste a decisão do orçamentista sobre quais itens/grupos da Planilha
 * são "estimados" (orcamento_estrutura.estimado/estimado_motivo) — ver aba
 * Estimados. Essa marcação é o que getCadernoData() usa pra separar Total
 * Orçado (A) de Serviços Estimados (B); substituiu o antigo sufixo "- Estimado"
 * no nome, que não tinha como saber se o preço já tinha sido preenchido.
 */
export async function atualizarItensEstimadosAction(
  orcamentoId: string,
  alteracoes: AlteracaoEstimado[]
): Promise<{ ok: true }> {
  if (alteracoes.length === 0) return { ok: true }
  const supabase = await createClient()
  const sb = supabase as any

  for (let i = 0; i < alteracoes.length; i += 200) {
    const lote = alteracoes.slice(i, i + 200)
    const resultados = await Promise.all(
      lote.map(a => sb.from('orcamento_estrutura')
        .update({ estimado: a.estimado, estimado_motivo: a.estimado ? (a.motivo?.trim() || null) : null })
        .eq('id', a.id)
        .eq('orcamento_id', orcamentoId)
      )
    )
    const falha = resultados.find((r: any) => r.error)
    if (falha?.error) throw new Error(`Erro ao salvar itens estimados: ${falha.error.message}`)
  }

  registrarHistorico(supabase, {
    orcamentoId,
    entidade: 'orcamento',
    tipo: 'info',
    acao: 'atualizar_itens_estimados',
    mensagem: `${alteracoes.length} item(ns) da planilha marcado(s)/desmarcado(s) como estimado`,
  }).catch(console.error)

  revalidatePath(`/orcamentos/${orcamentoId}/estimados`)
  revalidatePath(`/orcamentos/${orcamentoId}/relatorios`)
  revalidatePath(`/orcamentos/${orcamentoId}/configuracoes`)
  revalidatePath(`/orcamentos/${orcamentoId}/curva-abc`)

  return { ok: true }
}
