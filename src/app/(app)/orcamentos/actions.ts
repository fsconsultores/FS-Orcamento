'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function deleteOrcamento(orcamentoId: string): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any
  const { error } = await sb.from('tabela_orcamentos').delete().eq('id', orcamentoId)
  if (error) throw new Error(`Erro ao excluir orçamento: ${error.message}`)
  revalidatePath('/orcamentos')
}

export type DuplicateResult = {
  id: string
  nome_obra: string
  cliente: string | null
  data: string
  bdi_global: number
  codigo: string | null
  ultimo_acesso: string | null
  itemCount: number
}

export async function duplicateOrcamento(orcamentoId: string, novoCodigo: string): Promise<DuplicateResult> {
  const supabase = await createClient()
  const sb = supabase as any

  const { data: authData } = await supabase.auth.getUser()
  const user = authData?.user
  if (!user) throw new Error('Usuário não autenticado')

  const { data: orig, error: errOrig } = await sb
    .from('tabela_orcamentos')
    .select('nome_obra, cliente, data, bdi_global, tabela_itens_orcamento(id)')
    .eq('id', orcamentoId)
    .single()

  if (errOrig || !orig) throw new Error(`Orçamento não encontrado: ${errOrig?.message ?? ''}`)

  const { id: novoId, nome_obra: nomeNovo } = await criarNovoOrcamento(sb, user.id, orig, novoCodigo)

  // Estrutura, itens e composições em paralelo — insumos depois (precisa do compIdMap)
  const [, , compIdMap] = await Promise.all([
    clonarEstrutura(sb, orcamentoId, novoId),
    clonarItens(sb, orcamentoId, novoId),
    clonarComposicoes(sb, orcamentoId, novoId),
  ])
  await clonarInsumos(sb, orcamentoId, novoId, compIdMap)

  revalidatePath('/orcamentos')

  return {
    id: novoId,
    nome_obra: nomeNovo,
    cliente: orig.cliente ?? null,
    data: orig.data,
    bdi_global: orig.bdi_global,
    codigo: novoCodigo,
    ultimo_acesso: null,
    itemCount: (orig.tabela_itens_orcamento as any[])?.length ?? 0,
  }
}

async function gerarNomeCopia(sb: any, userId: string, nomeOrig: string): Promise<string> {
  const { data } = await sb
    .from('tabela_orcamentos').select('id').eq('user_id', userId)
    .ilike('nome_obra', `Cópia%de ${nomeOrig}`)
  const n = data?.length ?? 0
  return n === 0 ? `Cópia de ${nomeOrig}` : `Cópia ${n + 1} de ${nomeOrig}`
}

async function criarNovoOrcamento(
  sb: any, userId: string, orig: any, codigo: string
): Promise<{ id: string; nome_obra: string }> {
  const nomeNovo = await gerarNomeCopia(sb, userId, orig.nome_obra)
  const { data, error } = await sb.from('tabela_orcamentos').insert({
    user_id: userId, nome_obra: nomeNovo, cliente: orig.cliente ?? null,
    data: orig.data, bdi_global: orig.bdi_global, codigo,
  }).select('id').single()
  if (error) throw new Error(`Erro ao criar orçamento: ${error.message}`)
  return { id: data.id, nome_obra: nomeNovo }
}

async function clonarEstrutura(sb: any, fromId: string, toId: string): Promise<void> {
  const { data: rows } = await sb
    .from('orcamento_estrutura')
    .select('id, parent_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, tipo, ordem')
    .eq('orcamento_id', fromId)
    .order('nivel').order('ordem')

  if (!rows?.length) return

  const idMap: Record<string, string> = {}
  const maxNivel = Math.max(...rows.map((r: any) => r.nivel))

  for (let nivel = 1; nivel <= maxNivel; nivel++) {
    const nivelRows = rows.filter((r: any) => r.nivel === nivel)
    if (!nivelRows.length) continue

    const { data: inserted, error } = await sb
      .from('orcamento_estrutura')
      .insert(nivelRows.map((r: any) => ({
        orcamento_id: toId,
        parent_id: r.parent_id ? (idMap[r.parent_id] ?? null) : null,
        numero: r.numero, nivel: r.nivel, codigo: r.codigo, descricao: r.descricao,
        unidade: r.unidade, quantidade: r.quantidade, custo_unitario: r.custo_unitario,
        tipo: r.tipo, ordem: r.ordem,
      })))
      .select('id')

    if (error) { console.error('[dup] estrutura nivel', nivel, error); continue }
    nivelRows.forEach((r: any, i: number) => { if (inserted?.[i]) idMap[r.id] = inserted[i].id })
  }
}

async function clonarItens(sb: any, fromId: string, toId: string): Promise<void> {
  const { data: itens } = await sb
    .from('tabela_itens_orcamento')
    .select('composicao_id, orcamento_composicao_id, quantidade, bdi_especifico')
    .eq('orcamento_id', fromId)

  if (!itens?.length) return

  const rows = itens.map((i: any) => {
    const row: any = { orcamento_id: toId, quantidade: i.quantidade, bdi_especifico: i.bdi_especifico }
    if (i.orcamento_composicao_id) row.orcamento_composicao_id = i.orcamento_composicao_id
    else row.composicao_id = i.composicao_id
    return row
  })

  const lotes = chunk(rows, 500)
  const erros = await Promise.all(lotes.map(l => sb.from('tabela_itens_orcamento').insert(l)))
  erros.forEach(({ error }: any) => { if (error) console.error('[dup] itens:', error) })
}

async function clonarComposicoes(sb: any, fromId: string, toId: string): Promise<Record<string, string>> {
  const { data: comps } = await sb
    .from('orcamento_composicoes')
    .select('id, codigo, descricao, unidade, base')
    .eq('orcamento_id', fromId)

  const map: Record<string, string> = {}
  if (!comps?.length) return map

  const { data: inserted, error } = await sb
    .from('orcamento_composicoes')
    .insert(comps.map((c: any) => ({ orcamento_id: toId, codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, base: c.base })))
    .select('id')

  if (error) { console.error('[dup] composicoes:', error); return map }
  comps.forEach((c: any, i: number) => { if (inserted?.[i]) map[c.id] = inserted[i].id })
  return map
}

async function clonarInsumos(
  sb: any, fromId: string, toId: string, compIdMap: Record<string, string>
): Promise<void> {
  const { data: insumos, error } = await sb
    .from('orcamento_insumos')
    .select('codigo, descricao, unidade, custo, indice, grupo, base, data_ref, composicao_id')
    .eq('orcamento_id', fromId)

  if (error) console.error('[dup] insumos fetch:', error)
  if (!insumos?.length) return

  const rows = insumos.map((i: any) => ({
    orcamento_id: toId, codigo: i.codigo, descricao: i.descricao,
    unidade: i.unidade, custo: i.custo, indice: i.indice ?? 1,
    grupo: i.grupo, base: i.base, data_ref: i.data_ref,
    composicao_id: i.composicao_id ? (compIdMap[i.composicao_id] ?? null) : null,
  }))

  const lotes = chunk(rows, 500)
  const erros = await Promise.all(lotes.map(l => sb.from('orcamento_insumos').insert(l)))
  erros.forEach(({ error: e }: any) => { if (e) console.error('[dup] insumos insert:', e) })
}

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size))
}
