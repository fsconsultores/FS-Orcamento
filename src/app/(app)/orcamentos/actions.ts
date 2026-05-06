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

export async function duplicateOrcamento(orcamentoId: string): Promise<DuplicateResult> {
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
  const { id: novoId, nome_obra: nomeNovo } = await criarNovoOrcamento(sb, user.id, orig)

  // 3-5. Clona dados
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
    codigo: null,
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
  sb: any, userId: string, orig: any
): Promise<{ id: string; nome_obra: string }> {
  const nomeNovo = await gerarNomeCopia(sb, userId, orig.nome_obra)

  const base = {
    user_id: userId,
    nome_obra: nomeNovo,
    cliente: orig.cliente ?? null,
    data: orig.data,
    bdi_global: orig.bdi_global,
  }

  // Tenta com codigo null
  const r1 = await sb.from('tabela_orcamentos').insert({ ...base, codigo: null }).select('id').single()
  if (!r1.error) return { id: r1.data.id, nome_obra: nomeNovo }

  // Se falhou por causa do codigo, tenta com '0'
  if (r1.error.message?.toLowerCase().includes('codigo') ||
      r1.error.message?.toLowerCase().includes('null') ||
      r1.error.code === '23502') {
    const r2 = await sb.from('tabela_orcamentos').insert({ ...base, codigo: '0' }).select('id').single()
    if (!r2.error) return { id: r2.data.id, nome_obra: nomeNovo }
    console.error('[duplicate] create r2:', r2.error)
    throw new Error(`Erro ao criar orçamento: ${r2.error.message}`)
  }

  console.error('[duplicate] create r1:', r1.error)
  throw new Error(`Erro ao criar orçamento: ${r1.error.message}`)
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
  const comColuna = await sb
    .from('orcamento_insumos')
    .select('codigo, descricao, unidade, custo, grupo, base, data_ref, composicao_id')
    .eq('orcamento_id', fromId)

  const insumos: any[] = comColuna.error
    ? ((await sb.from('orcamento_insumos')
        .select('codigo, descricao, unidade, custo, grupo, base, data_ref')
        .eq('orcamento_id', fromId)).data ?? [])
    : (comColuna.data ?? [])

  if (!insumos.length) return

  const rows = insumos.map((i: any) => {
    const row: any = {
      orcamento_id: toId,
      codigo: i.codigo,
      descricao: i.descricao,
      unidade: i.unidade,
      custo: i.custo,
      grupo: i.grupo,
      base: i.base,
      data_ref: i.data_ref,
    }
    // Só inclui composicao_id se estava presente no resultado E tem mapeamento
    if (i.composicao_id != null) {
      row.composicao_id = compIdMap[i.composicao_id] ?? null
    }
    return row
  })

  const { error } = await sb.from('orcamento_insumos').insert(rows)
  if (error) console.error('[duplicate] clonarInsumos:', error)
}
