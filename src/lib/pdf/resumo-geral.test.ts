import { describe, it, expect } from 'vitest'
import { splitResumoGeralDados, type ResumoGeralTabelasInput } from './resumo-geral'
import type { CadernoNode } from '@/lib/orcamento/caderno'

// Pedido explícito do usuário (2026-09-17): o percentual de cada linha do
// "(A) DETALHAMENTO DOS CUSTOS"/"(B) SERVIÇOS ESTIMADOS" do Resumo Geral deve
// ser sempre sobre o TOTAL DA OBRA (A+B) — antes, cada tabela calculava seu
// percentual sobre o próprio subtotal (linhas de A somavam 100% batendo só
// com A; linhas de B somavam 100% batendo só com B), inflando a fatia de B
// sempre que B era uma parcela pequena da obra.
function node(overrides: Partial<CadernoNode> & { numero: string; totalComBdi: number }): CadernoNode {
  return {
    id: overrides.numero,
    nivel: 1,
    codigo: null,
    descricao: overrides.numero,
    unidade: null,
    quantidade: null,
    tipo: 'grupo',
    custoMat: 0, custoMo: 0, custoTerceiros: 0, custoUnitario: 0,
    totalMat: 0, totalMo: 0, totalTerceiros: 0, total: overrides.totalComBdi,
    percentual: 0,
    custoMatComBdi: 0, custoMoComBdi: 0, custoTerceirosComBdi: 0, custoUnitarioComBdi: 0,
    percentualComBdi: 0,
    bdiPercentual: 0,
    classeAbc: null,
    planilhaId: null,
    estimado: false,
    estimado_motivo: null,
    valor_estimado: null,
    filhos: [],
    ...overrides,
  }
}

function montarInput(overrides: Partial<ResumoGeralTabelasInput> = {}): ResumoGeralTabelasInput {
  return {
    arvore: [],
    servicosEstimados: [],
    servicosComInsumoEstimado: [],
    totalGeralComBdi: 0,
    totalServicosEstimados: 0,
    categoriasResumo: [],
    ...overrides,
  }
}

describe('splitResumoGeralDados — percentual sobre o total da obra (A+B), não sobre a própria categoria', () => {
  it('grupo solto em (A): percentual é sobre A+B, não sobre A', () => {
    // A = 800 (2 grupos: 600 + 200), B = 200 -> total da obra = 1000.
    const arvore = [
      node({ numero: '01', descricao: 'Fundação', totalComBdi: 600 }),
      node({ numero: '02', descricao: 'Estrutura', totalComBdi: 200 }),
    ]
    const input = montarInput({
      arvore,
      servicosEstimados: [{ numero: '03', descricao: 'Paisagismo (estimado)', valor: 200 }],
    })
    const split = splitResumoGeralDados(input)

    expect(split.totalOrcadoA).toBe(800)
    expect(split.totalServicosEstimadosB).toBe(200)

    const grupo01 = split.detalhamentoRows.find(r => r.tipo === 'grupo' && r.node.numero === '01')!
    const grupo02 = split.detalhamentoRows.find(r => r.tipo === 'grupo' && r.node.numero === '02')!
    // Sobre A (comportamento antigo) seria 600/800=75% e 200/800=25%.
    // Sobre A+B (comportamento pedido) é 600/1000=60% e 200/1000=20%.
    expect(grupo01.percentual).toBeCloseTo(60)
    expect(grupo02.percentual).toBeCloseTo(20)
  })

  it('cabeçalho de categoria: percentual do subtotal da categoria é sobre A+B, não sobre A', () => {
    const arvore = [
      node({ numero: '01', descricao: 'Fundação', totalComBdi: 600 }),
      node({ numero: '02', descricao: 'Estrutura', totalComBdi: 200 }),
    ]
    const input = montarInput({
      arvore,
      servicosEstimados: [{ numero: '03', descricao: 'Paisagismo (estimado)', valor: 200 }],
      categoriasResumo: [{ id: 'c1', nome: 'Obra Civil', numeros: ['01', '02'] }],
    })
    const split = splitResumoGeralDados(input)

    const categoria = split.detalhamentoRows.find(r => r.tipo === 'categoria')!
    expect(categoria.total).toBe(800)
    // Sobre A seria 800/800=100%; sobre A+B (pedido) é 800/1000=80%.
    expect(categoria.percentual).toBeCloseTo(80)
  })

  it('quando não há Serviços Estimados (B=0), o percentual de (A) volta a bater com o total da própria tabela (100%)', () => {
    const arvore = [node({ numero: '01', descricao: 'Fundação', totalComBdi: 500 })]
    const input = montarInput({ arvore })
    const split = splitResumoGeralDados(input)

    expect(split.totalServicosEstimadosB).toBe(0)
    const grupo = split.detalhamentoRows.find(r => r.tipo === 'grupo')!
    expect(grupo.percentual).toBeCloseTo(100)
  })
})
