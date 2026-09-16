'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { registrarHistorico } from '@/lib/log'

export interface AlteracaoEstimado {
  id: string
  estimado: boolean
  motivo: string | null
  /** Override manual do valor em Serviços Estimados (B) — null usa o total calculado da planilha. */
  valorEstimado: number | null
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

  // 1 round-trip via RPC (update em massa com unnest) em vez de N/200 lotes
  // concorrentes — mesma otimização de sincronizar_custos_estrutura (ver
  // 20260916000000_bulk_update_numeros_e_estimados.sql). "Marcar todos os
  // visíveis"/"Marcar sugeridos" na aba Estimados rotineiramente gera
  // dezenas a centenas de alterações num só save.
  const { error: rpcError } = await sb.rpc('atualizar_itens_estimados', {
    p_orcamento_id: orcamentoId,
    p_ids: alteracoes.map(a => a.id),
    p_estimados: alteracoes.map(a => a.estimado),
    p_motivos: alteracoes.map(a => a.estimado ? (a.motivo?.trim() || null) : null),
    p_valores: alteracoes.map(a => a.estimado ? a.valorEstimado : null),
  })

  if (rpcError) {
    // RPC ainda não existe nesse banco (migração não aplicada) — cai pro
    // caminho antigo item a item.
    for (let i = 0; i < alteracoes.length; i += 200) {
      const lote = alteracoes.slice(i, i + 200)
      const resultados = await Promise.all(
        lote.map(a => sb.from('orcamento_estrutura')
          .update({
            estimado: a.estimado,
            estimado_motivo: a.estimado ? (a.motivo?.trim() || null) : null,
            valor_estimado: a.estimado ? a.valorEstimado : null,
          })
          .eq('id', a.id)
          .eq('orcamento_id', orcamentoId)
        )
      )
      const falha = resultados.find((r: any) => r.error)
      if (falha?.error) throw new Error(`Erro ao salvar itens estimados: ${falha.error.message}`)
    }
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
  revalidatePath(`/orcamentos/${orcamentoId}/caderno`)

  return { ok: true }
}
