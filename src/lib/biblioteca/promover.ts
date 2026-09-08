import type { SupabaseClient } from '@supabase/supabase-js'

export interface ItemJaNaBiblioteca {
  id: string
  descricao: string
  unidade: string
}

export type PromoverResult =
  | { status: 'criado'; id: string }
  | { status: 'atualizado'; id: string }
  | { status: 'conflito'; existente: ItemJaNaBiblioteca }

/** Resolve (RPC já existente) o id da base própria do usuário logado. */
async function basePropriaId(sb: any): Promise<string> {
  const { data, error } = await sb.rpc('get_or_create_propria_base')
  if (error) throw new Error(`Erro ao obter a base própria: ${error.message}`)
  return data as string
}

/**
 * Cria ou atualiza um insumo na base própria, por código. `silencioso=true`
 * (usado ao promover os insumos filhos de uma composição) NUNCA sobrescreve
 * um insumo já existente — só cria quando faltar, pra não reescrever preço
 * de um insumo compartilhado por outras composições da Biblioteca só porque
 * uma delas foi promovida de novo. `silencioso=false` (ação explícita sobre
 * 1 insumo) respeita `sobrescrever` e retorna 'conflito' quando não confirmado.
 */
async function upsertInsumoNaBibliotecaPorCodigo(
  sb: any,
  baseId: string,
  dados: { codigo: string; descricao: string; unidade: string; preco_base: number; grupo: string | null; observacao: string | null },
  sobrescrever: boolean,
  silencioso: boolean
): Promise<PromoverResult> {
  const { data: existente } = await sb
    .from('tabela_insumos')
    .select('id, descricao, unidade')
    .eq('base_id', baseId)
    .eq('codigo', dados.codigo)
    .maybeSingle()

  if (existente) {
    if (silencioso) return { status: 'atualizado', id: existente.id } // reaproveita sem tocar
    if (!sobrescrever) return { status: 'conflito', existente }
    const { error } = await sb.from('tabela_insumos').update({
      descricao: dados.descricao, unidade: dados.unidade, preco_base: dados.preco_base,
      grupo: dados.grupo, observacao: dados.observacao,
    }).eq('id', existente.id)
    if (error) throw new Error(`Erro ao atualizar insumo na Biblioteca: ${error.message}`)
    return { status: 'atualizado', id: existente.id }
  }

  const { data: novo, error } = await sb.from('tabela_insumos').insert({
    codigo: dados.codigo, descricao: dados.descricao, unidade: dados.unidade,
    preco_base: dados.preco_base, grupo: dados.grupo, observacao: dados.observacao,
    base_id: baseId,
  }).select('id').single()
  if (error) throw new Error(`Erro ao adicionar insumo à Biblioteca: ${error.message}`)
  return { status: 'criado', id: novo.id }
}

/**
 * Copia um insumo AVULSO de um orçamento para tabela_insumos (base própria)
 * — o item original em orcamento_insumos nunca é alterado nem removido
 * ("mover" = copiar, decisão confirmada com o usuário). `sobrescrever` só é
 * true na 2ª chamada, depois do usuário confirmar o conflito de código.
 */
export async function promoverInsumoAvulso(
  supabase: SupabaseClient,
  orcamentoId: string,
  insumoId: string,
  sobrescrever = false
): Promise<PromoverResult> {
  const sb = supabase as any

  const { data: origem, error: fetchErr } = await sb
    .from('orcamento_insumos')
    .select('codigo, descricao, unidade, custo, grupo, cotacao_observacoes')
    .eq('id', insumoId)
    .eq('orcamento_id', orcamentoId)
    .is('composicao_id', null)
    .single()
  if (fetchErr || !origem) throw new Error('Insumo avulso não encontrado neste orçamento.')

  const baseId = await basePropriaId(sb)
  return upsertInsumoNaBibliotecaPorCodigo(sb, baseId, {
    codigo: origem.codigo,
    descricao: origem.descricao,
    unidade: origem.unidade,
    preco_base: origem.custo,
    grupo: origem.grupo,
    observacao: origem.cotacao_observacoes ?? null,
  }, sobrescrever, false)
}

/**
 * Copia uma composição de um orçamento (+ os insumos embutidos nela) para a
 * base própria. Cria/atualiza a composição por código (mesma regra de
 * conflito explícito de promoverInsumoAvulso) e, para cada insumo filho,
 * cria-ou-reaproveita (silencioso) o insumo correspondente na Biblioteca
 * antes de religar tabela_itens_composicao.
 */
export async function promoverComposicao(
  supabase: SupabaseClient,
  orcamentoId: string,
  composicaoId: string,
  sobrescrever = false
): Promise<PromoverResult> {
  const sb = supabase as any

  const { data: origem, error: fetchErr } = await sb
    .from('orcamento_composicoes')
    .select('codigo, descricao, unidade')
    .eq('id', composicaoId)
    .eq('orcamento_id', orcamentoId)
    .single()
  if (fetchErr || !origem) throw new Error('Composição não encontrada neste orçamento.')

  const { data: itens, error: itensErr } = await sb
    .from('orcamento_insumos')
    .select('codigo, descricao, unidade, custo, grupo, indice')
    .eq('composicao_id', composicaoId)
    .is('deleted_at', null)
  if (itensErr) throw new Error(`Erro ao buscar insumos da composição: ${itensErr.message}`)
  if (!itens || itens.length === 0) throw new Error('Esta composição não tem insumos — nada para adicionar à Biblioteca.')

  const baseId = await basePropriaId(sb)

  const { data: compExistente } = await sb
    .from('tabela_composicoes')
    .select('id, descricao, unidade')
    .eq('base_id', baseId)
    .eq('codigo', origem.codigo)
    .maybeSingle()

  if (compExistente && !sobrescrever) {
    return { status: 'conflito', existente: compExistente }
  }

  let composicaoBibliotecaId: string
  if (compExistente) {
    composicaoBibliotecaId = compExistente.id
    const { error } = await sb.from('tabela_composicoes')
      .update({ descricao: origem.descricao, unidade: origem.unidade })
      .eq('id', composicaoBibliotecaId)
    if (error) throw new Error(`Erro ao atualizar composição na Biblioteca: ${error.message}`)
  } else {
    const { data: nova, error } = await sb.from('tabela_composicoes')
      .insert({ codigo: origem.codigo, descricao: origem.descricao, unidade: origem.unidade, base_id: baseId })
      .select('id').single()
    if (error) throw new Error(`Erro ao adicionar composição à Biblioteca: ${error.message}`)
    composicaoBibliotecaId = nova.id
  }

  // Insumos filhos: cria-ou-reaproveita (silencioso) — nunca sobrescreve o
  // preço de um insumo que a Biblioteca já tenha por outro motivo.
  type ItemOrigem = { codigo: string; descricao: string; unidade: string; custo: number; grupo: string | null; indice: number }
  const insumoIds: string[] = []
  for (const item of itens as ItemOrigem[]) {
    const r = await upsertInsumoNaBibliotecaPorCodigo(sb, baseId, {
      codigo: item.codigo, descricao: item.descricao, unidade: item.unidade,
      preco_base: item.custo, grupo: item.grupo, observacao: null,
    }, false, true)
    if (r.status === 'criado' || r.status === 'atualizado') insumoIds.push(r.id)
  }

  // Religa os itens: apaga os antigos (caso de sobrescrita) e insere os
  // atuais — mesmo padrão de composicoes/[id]/editar/page.tsx.
  const { error: delErr } = await sb.from('tabela_itens_composicao').delete().eq('composicao_id', composicaoBibliotecaId)
  if (delErr) throw new Error(`Erro ao religar insumos da composição: ${delErr.message}`)

  const rows = (itens as ItemOrigem[]).map((item, i) => ({
    composicao_id: composicaoBibliotecaId, insumo_id: insumoIds[i], indice: item.indice,
  }))
  const { error: insErr } = await sb.from('tabela_itens_composicao').insert(rows)
  if (insErr) throw new Error(`Erro ao vincular insumos da composição na Biblioteca: ${insErr.message}`)

  return compExistente ? { status: 'atualizado', id: composicaoBibliotecaId } : { status: 'criado', id: composicaoBibliotecaId }
}
