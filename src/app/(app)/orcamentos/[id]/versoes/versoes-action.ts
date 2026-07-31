'use server'

import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/supabase/auth'
import { revalidatePath } from 'next/cache'
import { capturarSnapshot, aplicarSnapshot, type VersaoSnapshotV1, type OrcamentoVersaoResumo } from '@/lib/orcamento/versoes'
import { executarCalculo } from '@/lib/orcamento/motor-calculo'
import { registrarHistorico } from '@/lib/log'

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

  // Rede de segurança: snapshot do estado atual antes de qualquer alteração,
  // para que o restore nunca seja destrutivo de verdade.
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

  // Configurações, planilhas, composições, insumos, estrutura e serviços
  // estimados — mesma rotina usada por "Criar novo orçamento desta versão".
  await aplicarSnapshot(sb, orcamentoId, snapshot)

  await registrarHistorico(supabase, { orcamentoId, tipo: 'sucesso', acao: 'versao_restaurada', entidade: 'versao', mensagem: `Orçamento restaurado para a versão "${versaoRow.mensagem}"`, detalhes: { versaoId } })

  // custo_unitario/calculado_em foram zerados em aplicarSnapshot — recalcula
  // tudo antes de devolver o controle à UI, para o usuário já ver valores corretos.
  await executarCalculo(supabase, orcamentoId, { modo: 'forca' })

  revalidarRotasOrcamento(orcamentoId)

  return { ok: true }
}

// ─── Criar novo orçamento a partir de uma versão ──────────────────────────────

export interface DadosNovoOrcamentoDeVersao {
  nome_obra: string
  codigo: string | null
  cliente: string | null
  descricao: string | null
  mensagemInicial: string
}

/**
 * Cria um orçamento novo e independente a partir do snapshot de uma versão
 * existente — complementa Restaurar (que sobrescreve o orçamento atual) sem
 * alterar em nada o orçamento nem as versões de origem. Reaproveita o mesmo
 * `aplicarSnapshot` usado por `restaurarVersao`, só que aplicado sobre um
 * orçamento vazio recém-criado (o DELETE inicial de cada tabela não encontra
 * nada, então tudo vira INSERT com ids novos) e `criarVersao` para registrar
 * o primeiro commit do orçamento novo.
 */
export async function criarOrcamentoDeVersao(
  orcamentoOrigemId: string,
  versaoId: string,
  dados: DadosNovoOrcamentoDeVersao
): Promise<{ id: string; nome_obra: string }> {
  const nomeNovo = dados.nome_obra.trim()
  if (!nomeNovo) throw new Error('Informe o nome do novo orçamento.')
  const mensagemInicial = dados.mensagemInicial.trim()
  if (!mensagemInicial) throw new Error('A mensagem inicial é obrigatória.')
  const codigoNovo = dados.codigo?.trim() || null
  const clienteNovo = dados.cliente?.trim() || null

  const supabase = await createClient()
  const sb = supabase as any
  const user = await requireUser(supabase)

  const [{ data: versaoRow, error: versaoErr }, { data: origemRow }] = await Promise.all([
    sb.from('orcamento_versoes').select('mensagem, snapshot, schema_versao, criado_em').eq('id', versaoId).single(),
    sb.from('tabela_orcamentos').select('nome_obra').eq('id', orcamentoOrigemId).single(),
  ])
  if (versaoErr || !versaoRow) throw new Error(`Versão não encontrada: ${versaoErr?.message ?? ''}`)
  if (versaoRow.schema_versao !== 1) throw new Error(`Formato de snapshot não suportado (versão ${versaoRow.schema_versao}).`)
  const snapshot = versaoRow.snapshot as VersaoSnapshotV1

  // 1. Orçamento novo, vazio. Identidade (nome/código/cliente) vem do
  //    formulário — o resto (BDI, áreas, numeração, etc.) é aplicado no passo
  //    seguinte a partir do snapshot, então não precisa entrar aqui.
  const { data: novo, error: novoErr } = await sb
    .from('tabela_orcamentos')
    .insert({
      user_id: user.id,
      nome_obra: nomeNovo,
      codigo: codigoNovo,
      cliente: clienteNovo,
      origem_orcamento_id: orcamentoOrigemId,
      origem_versao_id: versaoId,
    })
    .select('id')
    .single()
  if (novoErr) throw new Error(`Erro ao criar orçamento: ${novoErr.message}`)
  const novoId = novo.id as string

  try {
    // 2. Popula o orçamento novo com o conteúdo do snapshot.
    await aplicarSnapshot(sb, novoId, snapshot, { nome_obra: nomeNovo, codigo: codigoNovo, cliente: clienteNovo })
    await executarCalculo(supabase, novoId, { modo: 'forca' })

    // 3. Primeira versão do orçamento novo — mesma ação usada no fluxo manual,
    //    captura o snapshot de verdade a partir do que acabou de ser gravado
    //    (garante que os ids do primeiro commit são os reais do orçamento novo).
    await criarVersao(novoId, mensagemInicial)
  } catch (e) {
    // Sem transação de banco cobrindo os passos acima (mesma limitação de
    // restaurarVersao) — em caso de falha no meio do caminho, evita deixar um
    // orçamento pela metade na lista: apaga o que foi criado (cascade cuida
    // de planilhas/estrutura/composições/insumos/versões já inseridas).
    await sb.from('tabela_orcamentos').delete().eq('id', novoId)
    throw e
  }

  registrarHistorico(supabase, {
    orcamentoId: novoId,
    entidade: 'orcamento',
    tipo: 'sucesso',
    acao: 'criar_orcamento_de_versao',
    mensagem: `Orçamento "${nomeNovo}" criado a partir da versão "${versaoRow.mensagem}" do orçamento "${origemRow?.nome_obra ?? orcamentoOrigemId}"`,
    detalhes: {
      orcamento_origem_id: orcamentoOrigemId,
      orcamento_origem_nome: origemRow?.nome_obra ?? null,
      versao_origem_id: versaoId,
      versao_origem_mensagem: versaoRow.mensagem,
      versao_origem_criado_em: versaoRow.criado_em,
      descricao: dados.descricao?.trim() || null,
    },
  }).catch(console.error)

  revalidatePath('/orcamentos')
  revalidarRotasOrcamento(novoId)

  return { id: novoId, nome_obra: nomeNovo }
}
