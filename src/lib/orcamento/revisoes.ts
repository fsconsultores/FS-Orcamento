import type { SupabaseClient } from '@supabase/supabase-js'

export interface RevisaoResumo {
  id: string
  nome_obra: string
  codigo: string | null
  numero_revisao: number
  criado_em: string
  ultimo_acesso: string | null
  autor_email: string | null
  ehAtual: boolean
}

/**
 * Todas as revisões da família de `orcamentoId` (mesmo grupo_id), da mais
 * antiga pra mais nova — o que a aba Revisões lista. `ehAtual` marca a
 * revisão de maior numero_revisao (a "ponta" da família), calculado aqui em
 * vez de persistido: uma flag booleana precisaria ser atualizada toda vez
 * que uma revisão nova nasce, e sairia de sincronia na primeira falha
 * parcial — MAX(numero_revisao) nunca fica desatualizado.
 */
export async function listarRevisoes(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<RevisaoResumo[]> {
  const sb = supabase as any

  const { data: atual, error: errAtual } = await sb
    .from('tabela_orcamentos')
    .select('grupo_id')
    .eq('id', orcamentoId)
    .single()
  if (errAtual || !atual) throw new Error(`Orçamento não encontrado: ${errAtual?.message ?? ''}`)

  const { data: revisoes, error } = await sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, codigo, numero_revisao, created_at, ultimo_acesso, criado_por_email')
    .eq('grupo_id', atual.grupo_id)
    .order('numero_revisao', { ascending: true })
  if (error) throw new Error(`Erro ao listar revisões: ${error.message}`)

  const rows = (revisoes ?? []) as { id: string; nome_obra: string; codigo: string | null; numero_revisao: number; created_at: string; ultimo_acesso: string | null; criado_por_email: string | null }[]
  if (rows.length === 0) return []

  const maiorNumero = Math.max(...rows.map(r => r.numero_revisao))

  return rows.map(r => ({
    id: r.id,
    nome_obra: r.nome_obra,
    codigo: r.codigo,
    numero_revisao: r.numero_revisao,
    criado_em: r.created_at,
    ultimo_acesso: r.ultimo_acesso,
    // NULL pra todo orçamento criado antes desta migração — sem como saber
    // retroativamente quem criou. Revisões novas sempre têm o e-mail.
    autor_email: r.criado_por_email,
    ehAtual: r.numero_revisao === maiorNumero,
  }))
}

export interface InsumoComparado {
  codigo: string
  descricao: string
  unidade: string
  /** custo em cada revisão, alinhado por posição às `revisoes` do resultado — null quando o insumo não existe (ainda) naquela revisão. */
  precos: (number | null)[]
}

export interface ComparacaoRevisoes {
  revisoes: RevisaoResumo[]
  insumos: InsumoComparado[]
}

function variacaoAbsoluta(precos: (number | null)[]): number {
  const presentes = precos.filter((p): p is number => p != null)
  return Math.abs(presentes[presentes.length - 1] - presentes[0])
}

/**
 * Compara o preço dos insumos avulsos entre todas as revisões de uma
 * família — só os que realmente têm mais de um valor distinto em algum
 * ponto (avulsos idênticos em toda a família não entram, não sobra nada pra
 * "comparar"). Um insumo ausente numa revisão específica (cadastrado ou
 * removido depois) aparece como null naquela posição em vez de quebrar a
 * comparação. Ordenado pela maior variação absoluta entre o primeiro e o
 * último valor presente — quem mudou mais em R$ aparece primeiro.
 */
export async function compararInsumosRevisoes(
  supabase: SupabaseClient,
  orcamentoId: string
): Promise<ComparacaoRevisoes> {
  const sb = supabase as any
  const revisoes = await listarRevisoes(supabase, orcamentoId)
  if (revisoes.length < 2) return { revisoes, insumos: [] }

  const porRevisao = await Promise.all(
    revisoes.map(async r => {
      const { data, error } = await sb
        .from('orcamento_insumos')
        .select('codigo, descricao, unidade, custo')
        .eq('orcamento_id', r.id)
        .is('composicao_id', null)
      if (error) throw new Error(`Erro ao buscar insumos da revisão ${r.numero_revisao}: ${error.message}`)
      return data as { codigo: string; descricao: string; unidade: string; custo: number }[]
    })
  )

  const porCodigo = new Map<string, { descricao: string; unidade: string; precos: (number | null)[] }>()
  porRevisao.forEach((insumos, idx) => {
    for (const ins of insumos) {
      if (!ins.codigo) continue
      let entry = porCodigo.get(ins.codigo)
      if (!entry) {
        entry = { descricao: ins.descricao, unidade: ins.unidade, precos: new Array(revisoes.length).fill(null) }
        porCodigo.set(ins.codigo, entry)
      }
      entry.precos[idx] = ins.custo
    }
  })

  const mudaram: InsumoComparado[] = []
  for (const [codigo, entry] of porCodigo) {
    const presentes = entry.precos.filter((p): p is number => p != null)
    if (new Set(presentes).size < 2) continue
    mudaram.push({ codigo, descricao: entry.descricao, unidade: entry.unidade, precos: entry.precos })
  }
  mudaram.sort((a, b) => variacaoAbsoluta(b.precos) - variacaoAbsoluta(a.precos))

  return { revisoes, insumos: mudaram }
}
