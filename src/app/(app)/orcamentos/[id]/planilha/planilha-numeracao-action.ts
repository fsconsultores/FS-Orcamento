'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { fetchAllPaginatedParallel } from '@/lib/orcamento/paginate'

export async function salvarNumeros(
  orcamentoId: string,
  updates: { id: string; numero: string; nivel: number }[]
): Promise<void> {
  if (updates.length === 0) return
  const supabase = await createClient()
  const sb = supabase as any

  // 1 round-trip via RPC (update em massa com unnest) em vez de N/50 lotes
  // concorrentes — mesma otimização de sincronizar_custos_estrutura (ver
  // 20260916000000_bulk_update_numeros_e_estimados.sql). Toda renumeração
  // reatribui TODA a EAP do orçamento (ver salvarConfigNumeracao), então
  // updates aqui é rotineiramente milhares de linhas.
  const { error: rpcError } = await sb.rpc('atualizar_numeros_estrutura', {
    p_orcamento_id: orcamentoId,
    p_ids: updates.map(u => u.id),
    p_numeros: updates.map(u => u.numero),
    p_niveis: updates.map(u => u.nivel),
  })
  if (!rpcError) return

  // RPC ainda não existe nesse banco (migração não aplicada) — cai pro
  // caminho antigo item a item.
  const BATCH = 50
  for (let i = 0; i < updates.length; i += BATCH) {
    await Promise.all(
      updates.slice(i, i + BATCH).map(u =>
        sb.from('orcamento_estrutura').update({ numero: u.numero, nivel: u.nivel }).eq('id', u.id)
      )
    )
  }
}

export async function salvarConfigNumeracao(
  orcamentoId: string,
  digitos: number[]
): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any

  const { error } = await sb
    .from('tabela_orcamentos')
    .update({ numeracao_digitos: digitos })
    .eq('id', orcamentoId)
  if (error) throw new Error(`Erro ao salvar configuração de numeração: ${error.message}`)

  // fetchAllPaginatedParallel (não um select() solto): sem paginar, o
  // PostgREST corta a resposta em 1000 linhas por padrão — numa planilha
  // grande isso deixava nós de fora da árvore reconstruída aqui, corrompendo
  // a sequência de numeração dos irmãos restantes (mesma classe de bug
  // encontrada em outros pontos que leem orcamento_estrutura sem paginar).
  const items = await fetchAllPaginatedParallel<{ id: string; parent_id: string | null; ordem: number }>((from, to) =>
    sb.from('orcamento_estrutura')
      .select('id, parent_id, ordem', { count: 'exact' })
      .eq('orcamento_id', orcamentoId)
      .range(from, to)
  )
  if (items.length > 0) {
    interface Node { id: string; parent_id: string | null; ordem: number; filhos: Node[] }
    const map = new Map<string, Node>()
    for (const item of items) map.set(item.id, { ...item, filhos: [] })
    const roots: Node[] = []
    for (const node of map.values()) {
      if (node.parent_id && map.has(node.parent_id)) map.get(node.parent_id)!.filhos.push(node)
      else roots.push(node)
    }

    const updates: { id: string; numero: string; nivel: number }[] = []
    function atribuir(nodes: Node[], nivel: number, prefix: string) {
      nodes.sort((a, b) => a.ordem - b.ordem)
      const width = digitos[nivel - 1] ?? digitos[digitos.length - 1] ?? 1
      nodes.forEach((node, i) => {
        const seq = String(i + 1).padStart(width, '0')
        const numero = prefix ? `${prefix}.${seq}` : seq
        updates.push({ id: node.id, numero, nivel })
        atribuir(node.filhos, nivel + 1, numero)
      })
    }
    atribuir(roots, 1, '')

    await salvarNumeros(orcamentoId, updates)
  }

  revalidatePath(`/orcamentos/${orcamentoId}/planilha`)
  revalidatePath(`/orcamentos/${orcamentoId}/configuracoes`)
  revalidatePath(`/orcamentos/${orcamentoId}/caderno`)
}
