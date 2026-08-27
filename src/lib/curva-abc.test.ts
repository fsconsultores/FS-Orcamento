import { describe, it, expect } from 'vitest'
import { calcularCurvaAbc, computeIdsEstimados, computeAbcCurvaUnica } from './curva-abc'

describe('calcularCurvaAbc', () => {
  // Valores redondos de propósito (500/300/150/50, total 1000) — os
  // percentuais acumulados batem em 50/80/95/100 exatamente, sem ruído de
  // ponto flutuante, o que deixa os limites de classe (≤80/≤95) testáveis
  // com igualdade exata em vez de tolerância.
  const items = [
    { codigo: 'D', descricao: 'Item D', unidade: 'UN', quantidade: 10, custo_unitario: 5 },
    { codigo: 'A', descricao: 'Item A', unidade: 'UN', quantidade: 10, custo_unitario: 50 },
    { codigo: 'C', descricao: 'Item C', unidade: 'UN', quantidade: 10, custo_unitario: 15 },
    { codigo: 'B', descricao: 'Item B', unidade: 'UN', quantidade: 10, custo_unitario: 30 },
  ]

  it('ordena por valor total decrescente, independente da ordem de entrada', () => {
    const r = calcularCurvaAbc(items)
    expect(r.map(i => i.codigo)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('calcula o percentual individual de cada item sobre o total do conjunto', () => {
    const r = calcularCurvaAbc(items)
    expect(r.find(i => i.codigo === 'A')!.percentual).toBeCloseTo(50)
    expect(r.find(i => i.codigo === 'B')!.percentual).toBeCloseTo(30)
    expect(r.find(i => i.codigo === 'C')!.percentual).toBeCloseTo(15)
    expect(r.find(i => i.codigo === 'D')!.percentual).toBeCloseTo(5)
  })

  it('acumula o percentual na ordem já ordenada por valor', () => {
    const r = calcularCurvaAbc(items)
    expect(r.map(i => i.percentual_acumulado)).toEqual([50, 80, 95, 100])
  })

  it('a soma dos percentuais individuais fecha em 100%', () => {
    const r = calcularCurvaAbc(items)
    const soma = r.reduce((s, i) => s + i.percentual, 0)
    expect(soma).toBeCloseTo(100)
  })

  it('o percentual acumulado do último item chega exatamente a 100%', () => {
    const r = calcularCurvaAbc(items)
    expect(r[r.length - 1].percentual_acumulado).toBe(100)
  })

  it('classifica A/B/C nos limites documentados (≤80% → A, ≤95% → B, senão C)', () => {
    const r = calcularCurvaAbc(items)
    // B fecha o acumulado em exatamente 80% e C em exatamente 95% — os dois
    // casos de fronteira do critério "<=" ficam cobertos.
    expect(r.map(i => i.classe)).toEqual(['A', 'A', 'B', 'C'])
  })

  it('ignora itens com valor total zero ou negativo, sem afetar o total/percentuais dos demais', () => {
    const r = calcularCurvaAbc([
      ...items,
      { codigo: 'ZERO', descricao: 'Sem custo', unidade: 'UN', quantidade: 5, custo_unitario: 0 },
      { codigo: 'NEG', descricao: 'Custo negativo', unidade: 'UN', quantidade: 5, custo_unitario: -1 },
    ])
    expect(r.find(i => i.codigo === 'ZERO')).toBeUndefined()
    expect(r.find(i => i.codigo === 'NEG')).toBeUndefined()
    expect(r).toHaveLength(4)
    expect(r.find(i => i.codigo === 'A')!.percentual).toBeCloseTo(50)
  })

  it('retorna lista vazia quando não há itens com valor', () => {
    expect(calcularCurvaAbc([])).toEqual([])
    expect(
      calcularCurvaAbc([{ codigo: 'X', descricao: 'X', unidade: null, quantidade: 0, custo_unitario: 10 }])
    ).toEqual([])
  })
})

describe('computeIdsEstimados', () => {
  it('marca o próprio nó e toda a subárvore de um item/grupo estimado', () => {
    const nodes = [
      { id: 'raiz', parent_id: null, estimado: false },
      { id: 'grupo-estimado', parent_id: 'raiz', estimado: true },
      { id: 'filho-1', parent_id: 'grupo-estimado', estimado: false },
      { id: 'neto-1', parent_id: 'filho-1', estimado: false },
      { id: 'irmao-normal', parent_id: 'raiz', estimado: false },
    ]
    const ids = computeIdsEstimados(nodes)
    expect(ids.has('grupo-estimado')).toBe(true)
    expect(ids.has('filho-1')).toBe(true)
    expect(ids.has('neto-1')).toBe(true)
    expect(ids.has('irmao-normal')).toBe(false)
    expect(ids.has('raiz')).toBe(false)
  })

  it('não marca nada quando nenhum nó está marcado como estimado', () => {
    const nodes = [
      { id: 'a', parent_id: null, estimado: false },
      { id: 'b', parent_id: 'a', estimado: false },
    ]
    expect(computeIdsEstimados(nodes).size).toBe(0)
  })
})

describe('regressão: itens "Estimados" não podem vazar para a Curva ABC', () => {
  // Bug encontrado na auditoria: a página standalone /curva-abc não excluía
  // itens marcados como estimado (nem descendentes de um grupo marcado),
  // diferente da Curva ABC embutida no Caderno (getCadernoData), que já
  // filtrava corretamente. Isso inflava o total e distorcia percentual/classe
  // de todo o resto do orçamento.
  it('exclui item estimado e sua subárvore do ranking, mesmo com valor muito maior que os itens reais', () => {
    // Mesmo formato de dados que a página monta a partir de orcamento_estrutura.
    const estrutura = [
      { id: 'g-real', parent_id: null, tipo: 'grupo' as const, estimado: false, codigo: null, descricao: 'Fundação', unidade: null, quantidade: null, custo_unitario: null },
      { id: 'i-real', parent_id: 'g-real', tipo: 'item' as const, estimado: false, codigo: 'I001', descricao: 'Escavação', unidade: 'M3', quantidade: 10, custo_unitario: 10 },
      { id: 'g-estimado', parent_id: null, tipo: 'grupo' as const, estimado: true, codigo: null, descricao: 'Paisagismo (estimado)', unidade: null, quantidade: null, custo_unitario: null },
      { id: 'i-estimado', parent_id: 'g-estimado', tipo: 'item' as const, estimado: false, codigo: 'I002', descricao: 'Jardim', unidade: 'VB', quantidade: 1, custo_unitario: 999999 },
    ]

    const idsEstimados = computeIdsEstimados(estrutura.map(e => ({ id: e.id, parent_id: e.parent_id, estimado: e.estimado })))
    const estItems = estrutura
      .filter(e => e.tipo === 'item' && !idsEstimados.has(e.id))
      .map(e => ({ codigo: e.codigo, descricao: e.descricao, unidade: e.unidade, quantidade: e.quantidade, custo_unitario: e.custo_unitario }))

    const curva = computeAbcCurvaUnica(estItems, [], [], [])

    expect(curva).toHaveLength(1)
    expect(curva[0].codigo).toBe('I001')
    expect(curva[0].percentual).toBe(100)
  })

  it('sem o filtro de estimados, o item de R$999.999 dominaria o ranking (prova de que o teste acima cobre o bug real)', () => {
    const estItemsSemFiltro = [
      { codigo: 'I001', descricao: 'Escavação', unidade: 'M3', quantidade: 10, custo_unitario: 10 },
      { codigo: 'I002', descricao: 'Jardim', unidade: 'VB', quantidade: 1, custo_unitario: 999999 },
    ]
    const curva = computeAbcCurvaUnica(estItemsSemFiltro, [], [], [])
    expect(curva).toHaveLength(2)
    expect(curva[0].codigo).toBe('I002')
    expect(curva.find(i => i.codigo === 'I001')!.percentual).toBeLessThan(1)
  })
})
