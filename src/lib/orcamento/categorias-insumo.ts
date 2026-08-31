import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeText } from '@/lib/text-normalize'

export interface CategoriaResumo {
  /** Rótulo de exibição — a variante de escrita mais usada entre as que caem na mesma chave normalizada. */
  categoria: string
  /** Soma de usos de TODAS as variantes de escrita fundidas nesta categoria (ex.: "Abajur" + "abajur" + "ABAJUR"). */
  usos: number
}

/**
 * Funde variantes de escrita da mesma categoria (ex.: "Abajur" + "abajur" +
 * "ABAJUR") numa linha só — soma os usos de todas e mantém como rótulo de
 * exibição a variante mais usada. Chave de agrupamento: normalizeText
 * (minúsculo, sem acento, espaço colapsado — mesma normalização já usada
 * pela busca do sistema, ver text-normalize.ts). Função pura, sem I/O, pra
 * poder testar o merge isoladamente do banco.
 */
export function mesclarVariantesCategoria(rows: { categoria: string; usos: number }[]): CategoriaResumo[] {
  const porChave = new Map<string, { categoria: string; melhorContagem: number; usos: number }>()
  for (const row of rows) {
    const chave = normalizeText(row.categoria)
    const atual = porChave.get(chave)
    if (!atual) {
      porChave.set(chave, { categoria: row.categoria, melhorContagem: row.usos, usos: row.usos })
    } else {
      atual.usos += row.usos
      if (row.usos > atual.melhorContagem) {
        atual.melhorContagem = row.usos
        atual.categoria = row.categoria
      }
    }
  }

  return [...porChave.values()]
    .map(({ categoria, usos }) => ({ categoria, usos }))
    .sort((a, b) => b.usos - a.usos || a.categoria.localeCompare(b.categoria, 'pt-BR'))
}

/**
 * Categorias já usadas em QUALQUER orçamento do domínio (não só o atual) —
 * alimenta o combobox "Categoria" na hora de classificar um insumo, pra
 * empurrar reaproveitar em vez de reinventar (ver análise "Categorias de
 * Insumos", 31/08/2026). RLS de orcamento_insumos já é por domínio, não por
 * usuário — mesma base que já permite a sugestão de preço cross-obra
 * existente (ver sugestoes-cotacao.ts) — então isso já funciona sem
 * nenhuma mudança de política.
 *
 * vw_categorias_insumo agrupa no banco por texto EXATO (poucas linhas: uma
 * por variante já digitada, não uma por insumo) — mesclarVariantesCategoria
 * funde as variantes de escrita em memória, sem tabela de categorias, sem
 * depender da extensão unaccent do Postgres.
 */
export async function listarCategoriasUsadas(supabase: SupabaseClient): Promise<CategoriaResumo[]> {
  const sb = supabase as any
  const { data, error } = await sb.from('vw_categorias_insumo').select('categoria, usos')
  if (error) throw new Error(`Erro ao listar categorias: ${error.message}`)
  return mesclarVariantesCategoria((data ?? []) as { categoria: string; usos: number }[])
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Sugere uma categoria já usada em qualquer obra a partir do texto da
 * descrição de um insumo novo — casa por PALAVRA INTEIRA (não substring
 * solto, pra "Ar" não bater dentro de "Armário"), preferindo a categoria
 * mais específica (nome mais comprido) quando mais de uma bate na mesma
 * descrição. Só pré-preenche um campo que continua editável — nunca decide
 * sozinho, mesmo espírito da "sugestão" já usada na aba Estimados (ver
 * estimado-sugestao.ts). Sem match nenhum (primeira vez que a categoria
 * apareceria), devolve null — a pessoa digita uma vez, e a partir daí toda
 * descrição parecida em qualquer obra passa a sugerir sozinha.
 */
export function sugerirCategoriaPorDescricao(descricao: string, categorias: CategoriaResumo[]): string | null {
  const descNorm = normalizeText(descricao)
  if (!descNorm) return null

  const candidatas = [...categorias].sort((a, b) => b.categoria.length - a.categoria.length)
  for (const cat of candidatas) {
    const catNorm = normalizeText(cat.categoria)
    if (!catNorm) continue
    const re = new RegExp(`(^|\\s)${escapeRegExp(catNorm)}(\\s|$)`)
    if (re.test(descNorm)) return cat.categoria
  }
  return null
}
