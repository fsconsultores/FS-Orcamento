import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { criarRevisao } from './duplicate'
import { listarRevisoes } from './revisoes'
import { persistirTotaisPlanilha } from './motor-calculo'
import { getCadernoData } from './caderno'
import { aplicarModeloAcrescimo } from './modelo-acrescimo'

// Testes de isolamento obrigatórios (ver proposta de revisões independentes)
// — rodam contra o banco de verdade (service role, mesmo padrão já usado nos
// scripts de verificação desta sessão), nunca contra dados reais do usuário:
// todo fixture é criado e apagado por este arquivo. Precisam da migração
// 20260828000000_orcamento_revisoes.sql já aplicada (grupo_id, numero_revisao,
// criado_por_email em tabela_orcamentos) — se ainda não foi, toda a suíte
// falha com "column does not exist", não com uma asserção de isolamento.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const USER_ID = process.env.TEST_USER_ID || '9dbd205c-f2fc-400e-855f-ac5e365ccdbb'
const USER_EMAIL = process.env.TEST_EMAIL || 'teste@fsconsultores.com.br'

const sb = createClient(url, serviceKey) as any

const stamp = Date.now()
const orcamentosParaLimpar: string[] = []
const globalInsumoIdsParaLimpar: string[] = []

let revisao1Id: string
let planilha1Id: string
let comp1Id: string
let cimentoInsumoId: string
let paredeEstruturaId: string

describe.sequential('Isolamento entre revisões', () => {
  beforeAll(async () => {
    // Fixture: Revisão 1 com BDI 10%, uma composição "Alvenaria" (Cimento
    // R$30 + Areia R$20 = R$50) usada num item "Parede" (qtd=10 -> R$500).
    const { data: orc, error: errOrc } = await sb
      .from('tabela_orcamentos')
      .insert({ user_id: USER_ID, nome_obra: `Teste Isolamento ${stamp}`, codigo: `ISO-${stamp}`, data: new Date().toISOString().split('T')[0], bdi_global: 10, modelo_acrescimo: 'bdi' })
      .select('id')
      .single()
    if (errOrc) throw errOrc
    revisao1Id = orc.id
    orcamentosParaLimpar.push(revisao1Id)

    const { data: planilha, error: errPlanilha } = await sb
      .from('orcamento_planilhas')
      .insert({ orcamento_id: revisao1Id, user_id: USER_ID, nome: 'Planilha Principal', bdi_global: 10, ordem: 0 })
      .select('id')
      .single()
    if (errPlanilha) throw errPlanilha
    planilha1Id = planilha.id

    const { data: comp, error: errComp } = await sb
      .from('orcamento_composicoes')
      .insert({ orcamento_id: revisao1Id, codigo: `ISOTC-${stamp}`, descricao: 'Alvenaria (teste isolamento)', unidade: 'M2', base: 'TESTE', custo_unitario: 50 })
      .select('id')
      .single()
    if (errComp) throw errComp
    comp1Id = comp.id

    const { data: insumos, error: errIns } = await sb
      .from('orcamento_insumos')
      .insert([
        { orcamento_id: revisao1Id, codigo: `ISOCIM-${stamp}`, descricao: 'Cimento (teste)', unidade: 'SC', custo: 30, indice: 1, composicao_id: comp1Id, grupo: 'M' },
        { orcamento_id: revisao1Id, codigo: `ISOARE-${stamp}`, descricao: 'Areia (teste)', unidade: 'M3', custo: 20, indice: 1, composicao_id: comp1Id, grupo: 'M' },
      ])
      .select('id, codigo')
    if (errIns) throw errIns
    cimentoInsumoId = insumos.find((i: any) => i.codigo === `ISOCIM-${stamp}`).id

    const { data: estrutura, error: errEst } = await sb
      .from('orcamento_estrutura')
      .insert({
        orcamento_id: revisao1Id, planilha_id: planilha1Id, parent_id: null, numero: '01', nivel: 1,
        codigo: `ISOTC-${stamp}`, descricao: 'Parede', unidade: 'M2', quantidade: 10, custo_unitario: 50, tipo: 'item', ordem: 0,
      })
      .select('id')
      .single()
    if (errEst) throw errEst
    paredeEstruturaId = estrutura.id

    await persistirTotaisPlanilha(sb, revisao1Id, [planilha1Id])
  })

  afterAll(async () => {
    for (const id of globalInsumoIdsParaLimpar) {
      await sb.from('tabela_insumos').delete().eq('id', id)
    }
    for (const id of orcamentosParaLimpar) {
      await sb.from('tabela_orcamentos').delete().eq('id', id)
    }
  })

  let revisao2Id: string
  let revisao2CimentoId: string

  it('Teste 1 — alterar o mesmo preço na Revisão 2 não muda a Revisão 1', async () => {
    // Preço já é R$30 no fixture ("Alterar preço" — confirma o estado
    // conhecido antes de ramificar).
    const { data: cimentoAntes } = await sb.from('orcamento_insumos').select('custo').eq('id', cimentoInsumoId).single()
    expect(cimentoAntes.custo).toBe(30)

    const resultado = await criarRevisao(sb, USER_ID, USER_EMAIL, revisao1Id)
    revisao2Id = resultado.id
    orcamentosParaLimpar.push(revisao2Id)
    expect(resultado.numero_revisao).toBe(2)

    const { data: cimentoR2 } = await sb
      .from('orcamento_insumos')
      .select('id, custo')
      .eq('orcamento_id', revisao2Id)
      .eq('codigo', `ISOCIM-${stamp}`)
      .single()
    expect(cimentoR2.custo).toBe(30) // cópia fiel no momento da criação
    revisao2CimentoId = cimentoR2.id

    // Muda o preço SÓ na Revisão 2.
    const { error: errUpdate } = await sb.from('orcamento_insumos').update({ custo: 37 }).eq('id', revisao2CimentoId)
    expect(errUpdate).toBeNull()

    const { data: cimentoR1Depois } = await sb.from('orcamento_insumos').select('custo').eq('id', cimentoInsumoId).single()
    const { data: cimentoR2Depois } = await sb.from('orcamento_insumos').select('custo').eq('id', revisao2CimentoId).single()
    expect(cimentoR1Depois.custo).toBe(30)
    expect(cimentoR2Depois.custo).toBe(37)
  })

  it('Teste 2 — alterar composição na Revisão 2 não muda a Revisão 1', async () => {
    const { data: compR2 } = await sb
      .from('orcamento_composicoes')
      .select('id, custo_unitario')
      .eq('orcamento_id', revisao2Id)
      .eq('codigo', `ISOTC-${stamp}`)
      .single()
    expect(compR2.custo_unitario).toBe(50)

    const { error } = await sb.from('orcamento_composicoes').update({ custo_unitario: 65 }).eq('id', compR2.id)
    expect(error).toBeNull()

    const { data: comp1Depois } = await sb.from('orcamento_composicoes').select('custo_unitario').eq('id', comp1Id).single()
    const { data: comp2Depois } = await sb.from('orcamento_composicoes').select('custo_unitario').eq('id', compR2.id).single()
    expect(comp1Depois.custo_unitario).toBe(50)
    expect(comp2Depois.custo_unitario).toBe(65)
  })

  it('Teste 3 — alterar quantitativo na Revisão 2 não muda a Revisão 1', async () => {
    const { data: paredeR2 } = await sb
      .from('orcamento_estrutura')
      .select('id, quantidade')
      .eq('orcamento_id', revisao2Id)
      .eq('descricao', 'Parede')
      .single()
    expect(paredeR2.quantidade).toBe(10)

    const { error } = await sb.from('orcamento_estrutura').update({ quantidade: 25 }).eq('id', paredeR2.id)
    expect(error).toBeNull()

    const { data: parede1Depois } = await sb.from('orcamento_estrutura').select('quantidade').eq('id', paredeEstruturaId).single()
    const { data: parede2Depois } = await sb.from('orcamento_estrutura').select('quantidade').eq('id', paredeR2.id).single()
    expect(parede1Depois.quantidade).toBe(10)
    expect(parede2Depois.quantidade).toBe(25)
  })

  it('Teste 4 — alterar BDI/taxa na Revisão 2 não muda a Revisão 1', async () => {
    // aplicarModeloAcrescimo (não um update cru) — é o que o app de verdade
    // chama ao salvar Configurações, e propaga o BDI pra orcamento_planilhas
    // também (getCadernoData resolve o BDI efetivo pela planilha, não só
    // pelo orçamento — um update cru só em tabela_orcamentos não seria fiel
    // ao que "mudar o BDI" significa de verdade no sistema).
    await aplicarModeloAcrescimo(sb, revisao2Id, 'bdi', 22)

    const { data: orc1Depois } = await sb.from('tabela_orcamentos').select('bdi_global').eq('id', revisao1Id).single()
    const { data: orc2Depois } = await sb.from('tabela_orcamentos').select('bdi_global').eq('id', revisao2Id).single()
    expect(orc1Depois.bdi_global).toBe(10)
    expect(orc2Depois.bdi_global).toBe(22)

    const { data: planilha1Depois } = await sb.from('orcamento_planilhas').select('bdi_global').eq('id', planilha1Id).single()
    const { data: planilha2Depois } = await sb.from('orcamento_planilhas').select('bdi_global').eq('orcamento_id', revisao2Id).single()
    expect(planilha1Depois.bdi_global).toBe(10)
    expect(planilha2Depois.bdi_global).toBe(22)
  })

  it('Teste 5 — rodar o cálculo numa revisão não altera os totais de outra revisão', async () => {
    const { data: planilhasR1Antes } = await sb.from('orcamento_planilhas').select('id, total_custo, total_com_bdi').eq('orcamento_id', revisao1Id)
    const totalR1Antes = planilhasR1Antes[0]

    const { data: planilhasR2 } = await sb.from('orcamento_planilhas').select('id').eq('orcamento_id', revisao2Id)
    await persistirTotaisPlanilha(sb, revisao2Id, planilhasR2.map((p: any) => p.id))

    const { data: planilhasR1Depois } = await sb.from('orcamento_planilhas').select('id, total_custo, total_com_bdi').eq('orcamento_id', revisao1Id)
    expect(planilhasR1Depois[0].total_custo).toBe(totalR1Antes.total_custo)
    expect(planilhasR1Depois[0].total_com_bdi).toBe(totalR1Antes.total_com_bdi)
  })

  it('Teste 6 — relatório de cada revisão mostra só os valores daquela revisão', async () => {
    // Revisão 1: Parede 10×R$50=R$500 sem BDI, ×1.10=R$550 com BDI.
    // Revisão 2 (depois dos testes 1-4): quantidade 25, composição alterada
    // pra R$65/un (mas o item da estrutura ainda tem custo_unitario=50
    // gravado — sem recálculo de composição, o total reflete o que está na
    // linha do item, não o custo_unitario da composição isoladamente).
    const dataR1 = await getCadernoData(sb, revisao1Id)
    const dataR2 = await getCadernoData(sb, revisao2Id)

    expect(dataR1.totalGeralComBdi).toBeCloseTo(550) // 10 × 50 × 1.10
    expect(dataR2.totalGeralComBdi).toBeCloseTo(25 * 50 * 1.22) // qtd nova × custo do item × BDI novo
    expect(dataR1.totalGeralComBdi).not.toBeCloseTo(dataR2.totalGeralComBdi)
    expect(dataR1.orcamento.bdi_global).toBe(10)
    expect(dataR2.orcamento.bdi_global).toBe(22)
  })

  it('Teste 7 — alterar um preço na Base Global não altera nenhuma revisão existente', async () => {
    const { data: baseInsumo, error: errBase } = await sb
      .from('tabela_insumos')
      .insert({ codigo: `ISOBASE-${stamp}`, descricao: 'Insumo de base global (teste)', unidade: 'UN', preco_base: 100 })
      .select('id')
      .single()
    if (errBase) throw errBase
    globalInsumoIdsParaLimpar.push(baseInsumo.id)

    const { data: cimentoR1Antes } = await sb.from('orcamento_insumos').select('custo').eq('id', cimentoInsumoId).single()

    // Muda o preço na Base Global — nada aqui referencia orcamento_insumos.
    const { error: errUpdateBase } = await sb.from('tabela_insumos').update({ preco_base: 999 }).eq('id', baseInsumo.id)
    expect(errUpdateBase).toBeNull()

    const { data: cimentoR1Depois } = await sb.from('orcamento_insumos').select('custo').eq('id', cimentoInsumoId).single()
    expect(cimentoR1Depois.custo).toBe(cimentoR1Antes.custo)
    expect(cimentoR1Depois.custo).toBe(30)
  })

  it('listarRevisoes retorna as duas revisões da família, na ordem certa, com a mais recente marcada', async () => {
    const revisoes = await listarRevisoes(sb, revisao1Id)
    expect(revisoes.map(r => r.numero_revisao)).toEqual([1, 2])
    expect(revisoes.find(r => r.numero_revisao === 1)!.ehAtual).toBe(false)
    expect(revisoes.find(r => r.numero_revisao === 2)!.ehAtual).toBe(true)
    expect(revisoes.find(r => r.numero_revisao === 2)!.autor_email).toBe(USER_EMAIL)
  })
})
