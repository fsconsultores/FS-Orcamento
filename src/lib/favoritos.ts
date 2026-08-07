'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/supabase/auth'

export type EntityType = 'insumo' | 'composicao' | 'orcamento' | 'base'

/** Define o favorito do usuário logado para uma entidade a partir do estado
 * alvo explícito (não lê o estado atual antes de decidir) — assim, se o
 * client disparar a mesma chamada duas vezes (duplo clique, retry), as duas
 * convergem pro mesmo resultado em vez de se cancelarem uma à outra. Sem
 * revalidatePath de propósito — o toggle é otimista no client (ver
 * FavoriteButton), instantâneo. */
export async function toggleFavorito(
  entityType: EntityType,
  entityId: string,
  favorito: boolean
): Promise<{ favorito: boolean } | { error: string }> {
  const supabase = await createClient()
  const sb = supabase as any
  const user = await getUser(supabase)
  if (!user) return { error: 'Não autenticado.' }

  if (favorito) {
    const { error } = await sb
      .from('favoritos')
      .upsert(
        { user_id: user.id, entity_type: entityType, entity_id: entityId },
        { onConflict: 'user_id,entity_type,entity_id', ignoreDuplicates: true }
      )
    if (error) return { error: error.message }
  } else {
    const { error } = await sb
      .from('favoritos')
      .delete()
      .eq('user_id', user.id)
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
    if (error) return { error: error.message }
  }
  return { favorito }
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
