import { createClient } from '@/lib/supabase/server'
import { BasesView } from './bases-view'
import { unstable_cache } from 'next/cache'
import { PageHeader } from '@/components/ui/toolbar'
import { StatRow, StatCard } from '@/components/ui/stat-row'
import { Database, Package, Layers3 } from 'lucide-react'

export default async function BasesPage() {
  const supabase = await createClient()
  const sb = supabase as any

  // Garante que a base própria do usuário existe
  await sb.rpc('get_or_create_propria_base')

  const { data: basesRaw } = await sb
    .from('tabela_bases')
    .select('id, nome, orgao, tipo_base, created_at, is_favorito')
    .order('tipo_base')   // propria primeiro
    .order('is_favorito', { ascending: false })
    .order('created_at')

  const bases = (basesRaw ?? []) as {
    id: string; nome: string; orgao: string; tipo_base: string; created_at: string; is_favorito?: boolean
  }[]

  // Uma query de count que falha (rede/timeout sob a rajada de N bases × 2 queries em
  // paralelo) e é tratada como "0 resultados" fica indistinguível de uma base
  // genuinamente vazia — e esse zero errado entra no cache de 5 min abaixo. Um retry
  // rápido evita que uma falha passageira vire uma contagem errada e "grudada".
  async function contarComRetry(
    query: () => PromiseLike<{ count: number | null; error: { message: string } | null }>
  ): Promise<number> {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const { count, error } = await query()
      if (!error) return count ?? 0
    }
    return 0
  }

  // Contagens em paralelo — cache de 5 min para reduzir round-trips repetidos
  const getContagens = unstable_cache(
    async (ids: string[]) => {
      const resultados = await Promise.all(
        ids.map(async (id) => {
          const [ni, nc] = await Promise.all([
            contarComRetry(() => sb.from('tabela_insumos').select('*', { count: 'exact', head: true }).eq('base_id', id)),
            contarComRetry(() => sb.from('tabela_composicoes').select('*', { count: 'exact', head: true }).eq('base_id', id)),
          ])
          return { id, total_insumos: ni, total_composicoes: nc }
        })
      )
      return Object.fromEntries(resultados.map(r => [r.id, r]))
    },
    ['bases-contagens'],
    { revalidate: 300, tags: ['bases-contagens'] }
  )

  const contagens = await getContagens(bases.map(b => b.id))
  const basesComConts = bases.map(b => ({ ...b, ...(contagens[b.id] ?? { total_insumos: 0, total_composicoes: 0 }) }))

  const totalInsumos = basesComConts.reduce((s, b) => s + b.total_insumos, 0)
  const totalComposicoes = basesComConts.reduce((s, b) => s + b.total_composicoes, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bases de Dados"
        description={'Gerencie tabelas de referência (SINAPI, SUDECAP, etc.). Após importar insumos e composições, use "Da Base Global" em qualquer orçamento para ativar os preços.'}
      />

      <StatRow>
        <StatCard label="Bases cadastradas" value={basesComConts.length} icon={<Database size={16} />} />
        <StatCard label="Insumos" value={totalInsumos.toLocaleString('pt-BR')} icon={<Package size={16} />} />
        <StatCard label="Composições" value={totalComposicoes.toLocaleString('pt-BR')} icon={<Layers3 size={16} />} />
      </StatRow>

      <BasesView bases={basesComConts} />
    </div>
  )
}
