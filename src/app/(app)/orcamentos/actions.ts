'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export async function deleteOrcamento(orcamentoId: string): Promise<void> {
  const supabase = await createClient()
  const sb = supabase as any

  const { error } = await sb
    .from('tabela_orcamentos')
    .delete()
    .eq('id', orcamentoId)

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

  // 1. Busca o orçamento original incluindo codigo e contagem de itens
  const { data: orig, error: errOrig } = await sb
    .from('tabela_orcamentos')
    .select('nome_obra, cliente, data, bdi_global, codigo, tabela_itens_orcamento(id)')
    .eq('id', orcamentoId)
    .single()

  if (errOrig || !orig) {
    console.error('[duplicate] fetch orig:', errOrig)
    throw new Error(`Orçamento não encontrado: ${errOrig?.message ?? ''}`)
  }

  // 2. Cria o novo orçamento — retorna id e nome gerado
  const { id: novoId, nome_obra: nomeNovo } = await criarNovoOrcamento(sb, user.id, orig, novoCodigo)

  // 3-6. Clona dados
  await clonarEstrutura(sb, orcamentoId, novoId)
  await clonarItens(sb, orcamentoId, novoId)
  const compIdMap = await clonarComposicoes(sb, orcamentoId, novoId)
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
  // Conta cópias já existentes com padrão "Cópia%de <nome>"
  const { data: existentes } = await sb
    .from('tabela_orcamentos')
    .select('id')
    .eq('user_id', userId)
    .ilike('nome_obra', `Cópia%de ${nomeOrig}`)

  const n = existentes?.length ?? 0
  return n === 0 ? `Cópia de ${nomeOrig}` : `Cópia ${n + 1} de ${nomeOrig}`
}

async function criarNovoOrcamento(
  sb: any, userId: string, orig: any, codigo: string
): Promise<{ id: string; nome_obra: string }> {
  const nomeNovo = await gerarNomeCopia(sb, userId, orig.nome_obra)

  const row = {
    user_id: userId,
    nome_obra: nomeNovo,
    cliente: orig.cliente ?? null,
    data: orig.data,
    bdi_global: orig.bdi_global,
    codigo,
  }

  const { data, error } = await sb.from('tabela_orcamentos').insert(row).select('id').single()
  if (error) {
    console.error('[duplicate] create:', error)
    throw new Error(`Erro ao criar orçamento: ${error.message}`)
  }
  return { id: data.id, nome_obra: nomeNovo }
}

async function clonarEstrutura(sb: any, fromId: string, toId: string): Promise<void> {
  const { data: rows } = await sb
    .from('orcamento_estrutura')
    .select('id, parent_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, tipo, ordem')
    .eq('orcamento_id', fromId)
    .order('nivel', { ascending: true })
    .order('ordem', { ascending: true })

  if (!rows?.length) return

  const idMap: Record<string, string> = {}
  const maxNivel: number = Math.max(...rows.map((r: any) => r.nivel))

  for (let nivel = 1; nivel <= maxNivel; nivel++) {
    const nivelRows = rows.filter((r: any) => r.nivel === nivel)
    if (!nivelRows.length) continue

    const toInsert = nivelRows.map((r: any) => ({
      orcamento_id: toId,
      parent_id: r.parent_id ? (idMap[r.parent_id] ?? null) : null,
      numero: r.numero,
      nivel: r.nivel,
      codigo: r.codigo,
      descricao: r.descricao,
      unidade: r.unidade,
      quantidade: r.quantidade,
      custo_unitario: r.custo_unitario,
      tipo: r.tipo,
      ordem: r.ordem,
    }))

    const { data: inserted, error } = await sb
      .from('orcamento_estrutura')
      .insert(toInsert)
      .select('id')

    if (error) { console.error('[duplicate] clonarEstrutura nivel', nivel, error); continue }

    // Mapeia IDs antigos → novos (Supabase retorna na mesma ordem da inserção)
    nivelRows.forEach((r: any, i: number) => {
      if (inserted?.[i]) idMap[r.id] = inserted[i].id
    })
  }
}

async function clonarItens(sb: any, fromId: string, toId: string): Promise<void> {
  // Tenta buscar com a nova coluna; faz fallback sem ela se não existir
  const comNova = await sb
    .from('tabela_itens_orcamento')
    .select('composicao_id, orcamento_composicao_id, quantidade, bdi_especifico')
    .eq('orcamento_id', fromId)

  const itens: any[] = comNova.error
    ? ((await sb.from('tabela_itens_orcamento')
        .select('composicao_id, quantidade, bdi_especifico')
        .eq('orcamento_id', fromId)).data ?? [])
    : (comNova.data ?? [])

  if (!itens.length) return

  const rows = itens.map((i: any) => {
    const row: any = { orcamento_id: toId, quantidade: i.quantidade, bdi_especifico: i.bdi_especifico }
    if (i.orcamento_composicao_id) {
      row.orcamento_composicao_id = i.orcamento_composicao_id // será remapeado em etapa posterior se necessário
    } else {
      row.composicao_id = i.composicao_id
    }
    return row
  })

  const { error } = await sb.from('tabela_itens_orcamento').insert(rows)
  if (error) console.error('[duplicate] clonarItens:', error)
}

async function clonarComposicoes(sb: any, fromId: string, toId: string): Promise<Record<string, string>> {
  const { data: comps } = await sb
    .from('orcamento_composicoes')
    .select('id, codigo, descricao, unidade, base')
    .eq('orcamento_id', fromId)

  const map: Record<string, string> = {}
  for (const c of comps ?? []) {
    const { data: nc } = await sb
      .from('orcamento_composicoes')
      .insert({ orcamento_id: toId, codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, base: c.base })
      .select('id')
      .single()
    if (nc) map[c.id] = nc.id
  }
  return map
}

async function clonarInsumos(
  sb: any, fromId: string, toId: string, compIdMap: Record<string, string>
): Promise<void> {
  // Tenta buscar com composicao_id; faz fallback sem ela
  const { data: insumos, error: fetchErr } = await sb
    .from('orcamento_insumos')
    .select('codigo, descricao, unidade, custo, indice, grupo, base, data_ref, composicao_id')
    .eq('orcamento_id', fromId)

  if (fetchErr) console.error('[duplicate] clonarInsumos fetch:', fetchErr)
  if (!insumos?.length) return

  const rows = insumos.map((i: any) => ({
    orcamento_id: toId,
    codigo: i.codigo,
    descricao: i.descricao,
    unidade: i.unidade,
    custo: i.custo,
    indice: i.indice ?? 1,
    grupo: i.grupo,
    base: i.base,
    data_ref: i.data_ref,
    composicao_id: i.composicao_id != null ? (compIdMap[i.composicao_id] ?? null) : null,
  }))

  const { error } = await sb.from('orcamento_insumos').insert(rows)
  if (error) console.error('[duplicate] clonarInsumos:', error)
}
