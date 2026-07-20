'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/supabase/auth'

export type EntityType = 'insumo' | 'composicao' | 'orcamento' | 'base'

/** Alterna o favorito do usuário logado para uma entidade. Sem revalidatePath
 * de propósito — o toggle é otimista no client (ver FavoriteButton), instantâneo. */
export async function toggleFavorito(
  entityType: EntityType,
  entityId: string
): Promise<{ favorito: boolean } | { error: string }> {
  const supabase = await createClient()
  const sb = supabase as any
  const user = await getUser(supabase)
  if (!user) return { error: 'Não autenticado.' }

  const { data: existente } = await sb
    .from('favoritos')
    .select('id')
    .eq('user_id', user.id)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle()

  if (existente) {
    const { error } = await sb.from('favoritos').delete().eq('id', existente.id)
    if (error) return { error: error.message }
    return { favorito: false }
  }

  const { error } = await sb
    .from('favoritos')
    .insert({ user_id: user.id, entity_type: entityType, entity_id: entityId })
  if (error) return { error: error.message }
  return { favorito: true }
}

/** IDs favoritados pelo usuário logado para um tipo de entidade (RLS já
 * restringe ao próprio usuário). Usado pelo filtro "somente favoritos". */
export async function getFavoritoIds(entityType: EntityType): Promise<string[]> {
  const supabase = await createClient()
  const sb = supabase as any
  const { data } = await sb.from('favoritos').select('entity_id').eq('entity_type', entityType)
  return ((data ?? []) as { entity_id: string }[]).map((r) => r.entity_id)
}

/** Best-effort — chamar após excluir insumo/composição/orçamento/base para
 * não acumular favoritos órfãos apontando para uma entidade que não existe mais. */
export async function removerFavoritosDaEntidade(
  supabase: SupabaseClient,
  entityType: EntityType,
  entityId: string
): Promise<void> {
  const sb = supabase as any
  await sb.from('favoritos').delete().eq('entity_type', entityType).eq('entity_id', entityId)
}
