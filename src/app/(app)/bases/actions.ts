'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/supabase/auth'
import { logAction } from '@/lib/log'

export async function createBase(orgao: string): Promise<{ id: string } | { error: string }> {
  if (!orgao.trim()) return { error: 'Nome obrigatório.' }
  const supabase = await createClient()
  const sb = supabase as any
  const user = await getUser(supabase)
  if (!user) return { error: 'Não autenticado.' }
  const { data, error } = await sb
    .from('tabela_bases')
    .insert({ nome: orgao.trim(), orgao: orgao.trim(), tipo_base: 'externa', user_id: user.id })
    .select('id')
    .single()
  if (error) return { error: error.message }
  revalidatePath('/bases')
  logAction(supabase, {
    usuario: user.email ?? '',
    tipo: 'sucesso',
    acao: 'criar_base',
    mensagem: `Base "${orgao.trim()}" criada`,
  }).catch(console.error)
  return { id: data.id }
}

export async function preencherPrecos(
  minhaBaseId: string,
  referenciaBaseId: string
): Promise<{ atualizados: number; naoEncontrados: number; error?: string }> {
  const supabase = await createClient()
  const sb = supabase as any
  const user = await getUser(supabase)
  if (!user) return { atualizados: 0, naoEncontrados: 0, error: 'Não autenticado.' }

  const { data: semPreco, error: e1 } = await sb
    .from('tabela_insumos')
    .select('id, codigo')
    .eq('base_id', minhaBaseId)
    .or('preco_base.is.null,preco_base.eq.0')
  if (e1) return { atualizados: 0, naoEncontrados: 0, error: e1.message }

  const insumos = (semPreco ?? []) as { id: string; codigo: string }[]
  if (insumos.length === 0) return { atualizados: 0, naoEncontrados: 0 }

  const codigos = insumos.map(i => i.codigo).filter(Boolean)
  const codigoToId = new Map(insumos.map(i => [i.codigo, i.id]))

  const lotesBusca = Array.from(
    { length: Math.ceil(codigos.length / 500) },
    (_, i) => codigos.slice(i * 500, (i + 1) * 500)
  )
  const resultsBusca = await Promise.all(
    lotesBusca.map(lote =>
      sb.from('tabela_insumos').select('codigo, preco_base').eq('base_id', referenciaBaseId).in('codigo', lote)
    )
  )

  const encontrados: { id: string; preco_base: number }[] = []
  for (const { data } of resultsBusca) {
    for (const ref of (data ?? []) as { codigo: string; preco_base: number }[]) {
      const id = codigoToId.get(ref.codigo)
      if (id && ref.preco_base > 0) encontrados.push({ id, preco_base: ref.preco_base })
    }
  }

  // Atualiza em paralelo (lotes de 50 para não saturar a conexão)
  const lotes = Array.from(
    { length: Math.ceil(encontrados.length / 50) },
    (_, i) => encontrados.slice(i * 50, (i + 1) * 50)
  )
  await Promise.all(
    lotes.flatMap(lote =>
      lote.map(u => sb.from('tabela_insumos').update({ preco_base: u.preco_base }).eq('id', u.id))
    )
  )

  logAction(supabase, {
    usuario: user.email ?? '',
    tipo: 'sucesso',
    acao: 'preencher_precos',
    mensagem: `${encontrados.length} preços preenchidos de base ${referenciaBaseId}`,
  }).catch(console.error)

  return { atualizados: encontrados.length, naoEncontrados: insumos.length - encontrados.length }
}

export async function deleteBase(baseId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const sb = supabase as any

  // Auth primeiro — antes de qualquer mutação
  const user = await getUser(supabase)
  if (!user) return { error: 'Não autenticado.' }

  const { data: base } = await sb.from('tabela_bases').select('orgao').eq('id', baseId).single()

  // Cascade manual: itens → composições → insumos → base
  const { data: comps } = await sb.from('tabela_composicoes').select('id').eq('base_id', baseId)
  const compIds = ((comps ?? []) as { id: string }[]).map(c => c.id)
  if (compIds.length > 0) {
    for (let i = 0; i < compIds.length; i += 500) {
      await sb.from('tabela_itens_composicao').delete().in('composicao_id', compIds.slice(i, i + 500))
    }
    await sb.from('tabela_composicoes').delete().eq('base_id', baseId)
  }
  await sb.from('tabela_insumos').delete().eq('base_id', baseId)

  const { error } = await sb.from('tabela_bases').delete().eq('id', baseId)
  if (error) return { error: error.message }

  revalidatePath('/bases')
  logAction(supabase, {
    usuario: user.email ?? '',
    tipo: 'sucesso',
    acao: 'excluir_base',
    mensagem: `Base "${base?.orgao ?? baseId}" excluída`,
  }).catch(console.error)
  return {}
}
