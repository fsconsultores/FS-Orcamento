import { createClient } from '@/lib/supabase/server'
import { BasesView } from './bases-view'
import { unstable_cache } from 'next/cache'

export default async function BasesPage() {
  const supabase = await createClient()
  const sb = supabase as any

  // Garante que a base própria do usuário existe
  await sb.rpc('get_or_create_propria_base')

  const { data: basesRaw } = await sb
    .from('tabela_bases')
    .select('id, nome, orgao, tipo_base, created_at')
    .order('tipo_base')   // propria primeiro
    .order('created_at')

  const bases = (basesRaw ?? []) as {
    id: string; nome: string; orgao: string; tipo_base: string; created_at: string
  }[]

  // Contagens em paralelo — cache de 5 min para reduzir round-trips repetidos
  const getContagens = unstable_cache(
    async (ids: string[]) => {
      const resultados = await Promise.all(
        ids.map(async (id) => {
          const [{ count: ni }, { count: nc }] = await Promise.all([
            sb.from('tabela_insumos').select('*', { count: 'exact', head: true }).eq('base_id', id),
            sb.from('tabela_composicoes').select('*', { count: 'exact', head: true }).eq('base_id', id),
          ])
          return { id, total_insumos: ni ?? 0, total_composicoes: nc ?? 0 }
        })
      )
      return Object.fromEntries(resultados.map(r => [r.id, r]))
    },
    ['bases-contagens'],
    { revalidate: 300, tags: ['bases-contagens'] }
  )

  const contagens = await getContagens(bases.map(b => b.id))
  const basesComConts = bases.map(b => ({ ...b, ...(contagens[b.id] ?? { total_insumos: 0, total_composicoes: 0 }) }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bases de Dados</h1>
        <p className="mt-1 text-sm text-gray-500">
          Gerencie tabelas de referência (SINAPI, SUDECAP, etc.). Após importar insumos e composições,
          use "Da Base Global" em qualquer orçamento para ativar os preços.
        </p>
      </div>
      <BasesView bases={basesComConts} />
    </div>
  )
}
