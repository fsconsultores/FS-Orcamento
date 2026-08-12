'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function salvarNumeros(
  orcamentoId: string,
  updates: { id: string; numero: string; nivel: number }[]
): Promise<void> {
  if (updates.length === 0) return
  const supabase = await createClient()
  const sb = supabase as any
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

  const { data } = await sb
    .from('orcamento_estrutura')
    .select('id, parent_id, ordem')
    .eq('orcamento_id', orcamentoId)
    .order('ordem', { ascending: true })

  const items = (data ?? []) as { id: string; parent_id: string | null; ordem: number }[]
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
