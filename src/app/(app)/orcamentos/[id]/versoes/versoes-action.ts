'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { capturarSnapshot, type VersaoSnapshotV1, type OrcamentoVersaoResumo } from '@/lib/orcamento/versoes'
import { executarCalculo } from '@/lib/orcamento/motor-calculo'
import { registrarHistorico } from '@/lib/log'

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size))
}

function revalidarRotasOrcamento(orcamentoId: string) {
  for (const rota of ['planilha', 'composicoes', 'insumos', 'relatorios', 'curva-abc', 'versoes']) {
    revalidatePath(`/orcamentos/${orcamentoId}/${rota}`)
  }
}

// ─── Criar versão ────────────────────────────────────────────────────────────

export async function criarVersao(orcamentoId: string, mensagem: string): Promise<{ id: string; criado_em: string }> {
  const msg = mensagem.trim()
  if (!msg) throw new Error('A mensagem da versão é obrigatória.')

  const supabase = await createClient()
  const sb = supabase as any

  const { data: { user } } = await supabase.auth.getUser()
  const snapshot = await capturarSnapshot(supabase, orcamentoId)

  const { data, error } = await sb
    .from('orcamento_versoes')
    .insert({
      orcamento_id: orcamentoId,
      mensagem: msg,
      user_id: user?.id ?? null,
      autor_email: user?.email ?? null,
      snapshot,
      origem: 'manual',
    })
    .select('id, criado_em')
    .single()
  if (error) throw new Error(`Erro ao criar versão: ${error.message}`)

  await registrarHistorico(supabase, { orcamentoId, tipo: 'sucesso', acao: 'versao_criada', entidade: 'versao', mensagem: `Versão criada: "${msg}"`, detalhes: { versaoId: data.id } })
  revalidatePath(`/orcamentos/${orcamentoId}/versoes`)

  return { id: data.id, criado_em: data.criado_em }
}

// ─── Listar / visualizar ─────────────────────────────────────────────────────

export async function listarVersoes(orcamentoId: string): Promise<OrcamentoVersaoResumo[]> {
  const supabase = await createClient()
  const sb = supabase as any
  const { data, error } = await sb
    .from('orcamento_versoes')
    .select('id, mensagem, autor_email, criado_em, origem')
    .eq('orcamento_id', orcamentoId)
    .order('criado_em', { ascending: false })
  if (error) throw new Error(`Erro ao listar versões: ${error.message}`)
  return data as OrcamentoVersaoResumo[]
}

export async function buscarSnapshotVersao(versaoId: string): Promise<VersaoSnapshotV1> {
  const supabase = await createClient()
  const sb = supabase as any
  const { data, error } = await sb
    .from('orcamento_versoes')
    .select('snapshot')
    .eq('id', versaoId)
    .single()
  if (error) throw new Error(`Erro ao buscar versão: ${error.message}`)
  return data.snapshot as VersaoSnapshotV1
}

// ─── Restaurar ───────────────────────────────────────────────────────────────

async function reconciliarPlanilhas(
  sb: any,
  orcamentoId: string,
  planilhas: VersaoSnapshotV1['planilhas']
): Promise<Map<string, string>> {
  const { data: atuais, error } = await sb
    .from('orcamento_planilhas')
    .select('id, ordem')
    .eq('orcamento_id', orcamentoId)
  if (error) throw new Error(`Erro ao ler planilhas atuais: ${error.message}`)

  const atuaisPorOrdem = new Map<number, string>()
  for (const p of atuais ?? []) atuaisPorOrdem.set(p.ordem, p.id)

  const idMap = new Map<string, string>()
  const ordensNoSnapshot = new Set<number>()

  for (const p of planilhas) {
    ordensNoSnapshot.add(p.ordem)
    const idExistente = atuaisPorOrdem.get(p.ordem)
    if (idExistente) {
      const { error: updErr } = await sb
        .from('orcamento_planilhas')
        .update({ nome: p.nome, bdi_global: p.bdi_global, total_custo: p.total_custo, total_com_bdi: p.total_com_bdi })
        .eq('id', idExistente)
      if (updErr) throw new Error(`Erro ao atualizar planilha: ${updErr.message}`)
      idMap.set(p.id, idExistente)
    } else {
      const { data: inserted, error: insErr } = await sb
        .from('orcamento_planilhas')
        .insert({
          orcamento_id: orcamentoId, nome: p.nome, bdi_global: p.bdi_global, ordem: p.ordem,
          total_custo: p.total_custo, total_com_bdi: p.total_com_bdi,
        })
        .select('id')
        .single()
      if (insErr) throw new Error(`Erro ao criar planilha: ${insErr.message}`)
      idMap.set(p.id, inserted.id)
    }
  }

  // Remove planilhas que existiam mas não estão mais no snapshot restaurado.
  for (const [ordem, id] of atuaisPorOrdem) {
    if (!ordensNoSnapshot.has(ordem)) {
      await sb.from('orcamento_planilhas').delete().eq('id', id)
    }
  }

  return idMap
}

async function restaurarComposicoes(
  sb: any,
  orcamentoId: string,
  composicoes: VersaoSnapshotV1['composicoes']
): Promise<Map<string, string>> {
  const { error: delErr } = await sb.from('orcamento_composicoes').delete().eq('orcamento_id', orcamentoId)
  if (delErr) throw new Error(`Erro ao limpar composições: ${delErr.message}`)

  const idMap = new Map<string, string>()
  if (composicoes.length === 0) return idMap

  for (const lote of chunk(composicoes, 500)) {
    const { data: inserted, error } = await sb
      .from('orcamento_composicoes')
      .insert(lote.map(c => ({
        orcamento_id: orcamentoId,
        codigo: c.codigo,
        // Preserva o código exatamente como estava no snapshot.
        codigo_original: c.codigo_original,
        descricao: c.descricao,
        unidade: c.unidade,
        base: c.base,
        custo_unitario: c.custo_unitario,
        calculado_em: null, // força recálculo completo no próximo "Calcular"
      })))
      .select('id')
    if (error) throw new Error(`Erro ao restaurar composições: ${error.message}`)
    lote.forEach((c, i) => idMap.set(c.id, inserted[i].id))
  }
  return idMap
}

async function restaurarInsumos(
  sb: any,
  orcamentoId: string,
  insumos: VersaoSnapshotV1['insumos'],
  compIdMap: Map<string, string>
): Promise<void> {
  const { error: delErr } = await sb.from('orcamento_insumos').delete().eq('orcamento_id', orcamentoId)
  if (delErr) throw new Error(`Erro ao limpar insumos: ${delErr.message}`)
  if (insumos.length === 0) return

  for (const lote of chunk(insumos, 500)) {
    const { error } = await sb
      .from('orcamento_insumos')
      .insert(lote.map(i => ({
        orcamento_id: orcamentoId,
        composicao_id: i.composicao_id ? (compIdMap.get(i.composicao_id) ?? null) : null,
        codigo: i.codigo,
        codigo_original: i.codigo_original, // idem: preserva o código do snapshot
        descricao: i.descricao,
        unidade: i.unidade,
        custo: i.custo,
        grupo: i.grupo,
        base: i.base,
        data_ref: i.data_ref,
        indice: i.indice,
        custo_atualizado_em: null, // força recálculo completo no próximo "Calcular"
      })))
    if (error) throw new Error(`Erro ao restaurar insumos: ${error.message}`)
  }
}

async function restaurarEstrutura(
  sb: any,
  orcamentoId: string,
  estrutura: VersaoSnapshotV1['estrutura'],
  planilhaIdMap: Map<string, string>
): Promise<void> {
  const { error: delErr } = await sb.from('orcamento_estrutura').delete().eq('orcamento_id', orcamentoId)
  if (delErr) throw new Error(`Erro ao limpar estrutura: ${delErr.message}`)
  if (estrutura.length === 0) return

  const idMap = new Map<string, string>()
  const byNivel = new Map<number, VersaoSnapshotV1['estrutura']>()
  for (const it of estrutura) {
    const arr = byNivel.get(it.nivel) ?? []
    arr.push(it)
    byNivel.set(it.nivel, arr)
  }

  for (const nivel of [...byNivel.keys()].sort((a, b) => a - b)) {
    const itens = byNivel.get(nivel)!
    const rows = itens.map(it => ({
      orcamento_id: orcamentoId,
      planilha_id: it.planilha_id ? (planilhaIdMap.get(it.planilha_id) ?? null) : null,
      parent_id: it.parent_id ? (idMap.get(it.parent_id) ?? null) : null,
      numero: it.numero,
      nivel: it.nivel,
      codigo: it.codigo,
      descricao: it.descricao,
      unidade: it.unidade,
      quantidade: it.quantidade,
      custo_unitario: it.custo_unitario,
      bdi_especifico: it.bdi_especifico,
      tipo: it.tipo,
      ordem: it.ordem,
    }))
    const { data: inserted, error } = await sb.from('orcamento_estrutura').insert(rows).select('id')
    if (error) throw new Error(`Erro ao restaurar estrutura (nível ${nivel}): ${error.message}`)
    itens.forEach((it, i) => idMap.set(it.id, inserted[i].id))
  }
}

async function restaurarServicosEstimados(
  sb: any,
  orcamentoId: string,
  servicos: VersaoSnapshotV1['servicosEstimados']
): Promise<void> {
  const { error: delErr } = await sb.from('orcamento_servicos_estimados').delete().eq('orcamento_id', orcamentoId)
  if (delErr) throw new Error(`Erro ao limpar serviços estimados: ${delErr.message}`)
  if (servicos.length === 0) return

  const { error } = await sb
    .from('orcamento_servicos_estimados')
    .insert(servicos.map(s => ({ orcamento_id: orcamentoId, descricao: s.descricao, valor: s.valor, ordem: s.ordem })))
  if (error) throw new Error(`Erro ao restaurar serviços estimados: ${error.message}`)
}

export async function restaurarVersao(orcamentoId: string, versaoId: string): Promise<{ ok: true }> {
  const supabase = await createClient()
  const sb = supabase as any

  const { data: versaoRow, error: versaoErr } = await sb
    .from('orcamento_versoes')
    .select('mensagem, snapshot, schema_versao')
    .eq('id', versaoId)
    .single()
  if (versaoErr || !versaoRow) throw new Error(`Versão não encontrada: ${versaoErr?.message ?? ''}`)
  if (versaoRow.schema_versao !== 1) throw new Error(`Formato de snapshot não suportado (versão ${versaoRow.schema_versao}).`)
  const snapshot = versaoRow.snapshot as VersaoSnapshotV1

  // 1. Rede de segurança: snapshot do estado atual antes de qualquer alteração,
  //    para que o restore nunca seja destrutivo de verdade.
  const { data: { user } } = await supabase.auth.getUser()
  const snapshotAtual = await capturarSnapshot(supabase, orcamentoId)
  const { error: safetyErr } = await sb.from('orcamento_versoes').insert({
    orcamento_id: orcamentoId,
    mensagem: `Antes de restaurar "${versaoRow.mensagem}"`,
    user_id: user?.id ?? null,
    autor_email: user?.email ?? null,
    snapshot: snapshotAtual,
    origem: 'pre_restore',
  })
  if (safetyErr) throw new Error(`Erro ao criar versão de segurança: ${safetyErr.message}`)

  // 2. Configurações do orçamento
  const orc = snapshot.orcamento
  const { error: updOrcErr } = await sb
    .from('tabela_orcamentos')
    .update({
      nome_obra: orc.nome_obra,
      cliente: orc.cliente,
      data: orc.data,
      bdi_global: orc.bdi_global,
      codigo: orc.codigo,
      area_total: orc.area_total,
      area_coberta: orc.area_coberta,
      area_equivalente: orc.area_equivalente,
      local: orc.local,
      numeracao_digitos: orc.numeracao_digitos,
      categorias_grafico: orc.categorias_grafico,
    })
    .eq('id', orcamentoId)
  if (updOrcErr) throw new Error(`Erro ao restaurar configurações do orçamento: ${updOrcErr.message}`)

  // 3-6. Planilhas, composições, insumos e estrutura (ordem importa: ids remapeados
  // em cada etapa alimentam a etapa seguinte).
  const planilhaIdMap = await reconciliarPlanilhas(sb, orcamentoId, snapshot.planilhas)
  const compIdMap = await restaurarComposicoes(sb, orcamentoId, snapshot.composicoes)
  await restaurarInsumos(sb, orcamentoId, snapshot.insumos, compIdMap)
  await restaurarEstrutura(sb, orcamentoId, snapshot.estrutura, planilhaIdMap)
  await restaurarServicosEstimados(sb, orcamentoId, snapshot.servicosEstimados)

  await registrarHistorico(supabase, { orcamentoId, tipo: 'sucesso', acao: 'versao_restaurada', entidade: 'versao', mensagem: `Orçamento restaurado para a versão "${versaoRow.mensagem}"`, detalhes: { versaoId } })

  // custo_unitario/calculado_em foram zerados nas etapas acima — recalcula tudo
  // antes de devolver o controle à UI, para que o usuário já veja valores corretos.
  await executarCalculo(supabase, orcamentoId, { modo: 'forca' })

  revalidarRotasOrcamento(orcamentoId)

  return { ok: true }
}
