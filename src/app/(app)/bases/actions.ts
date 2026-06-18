'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logAction } from '@/lib/log'

export async function createBase(orgao: string): Promise<{ id: string } | { error: string }> {
  if (!orgao.trim()) return { error: 'Nome obrigatório.' }
  const supabase = await createClient()
  const sb = supabase as any
  const { data: { user } } = await supabase.auth.getUser()
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

export async function deleteBase(baseId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const sb = supabase as any
  const { data: base } = await sb.from('tabela_bases').select('orgao').eq('id', baseId).single()
  // Remove itens dependentes em cascata
  const { data: comps } = await sb
    .from('tabela_composicoes')
    .select('id')
    .eq('base_id', baseId)
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
  const { data: authData } = await supabase.auth.getUser()
  logAction(supabase, {
    usuario: authData?.user?.email ?? '',
    tipo: 'sucesso',
    acao: 'excluir_base',
    mensagem: `Base "${base?.orgao ?? baseId}" excluída`,
  }).catch(console.error)
  return {}
}
