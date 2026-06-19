import type { SupabaseClient, User } from '@supabase/supabase-js'

/** Throws if there is no authenticated session. Use in server actions that propagate errors. */
export async function requireUser(supabase: SupabaseClient): Promise<User> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado.')
  return user
}

/** Returns null instead of throwing. Use in server actions that return { error } objects. */
export async function getUser(supabase: SupabaseClient): Promise<User | null> {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
