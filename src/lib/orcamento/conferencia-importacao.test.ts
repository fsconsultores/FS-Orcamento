import { describe, it, expect } from 'vitest'
import { compararComExcel, type ItemOrcamentoParaConferencia } from './conferencia-importacao'
import type { EstruturaRow } from '@/app/(app)/orcamentos/[id]/planilha/planilha-import-action'

function linhaExcel(over: Partial<EstruturaRow>): EstruturaRow {
  return {
    numero: '1', nivel: 1, codigo: 'C1', descricao: 'Item', unidade: 'UN', quantidade: 10, custo_unitario: 5, tipo: 'item', ordem: 0,
    ...over,
  }
}

function itemOrc(over: Partial<ItemOrcamentoParaConferencia>): ItemOrcamentoParaConferencia {
  return { id: 'id-1', numero: '1', descricao: 'Item', unidade: 'UN', quantidade: 10, nivel: 1, ordem: 0, ...over }
}

describe('compararComExcel', () => {
  it('marca como "confere" quando tudo bate', () => {
    const { itens, resumo } = compararComExcel([linhaExcel({})], [itemOrc({})])
    expect(itens).toHaveLength(1)
    expect(itens[0].status).toBe('confere')
    expect(itens[0].divergencias).toHaveLength(0)
    expect(resumo.confere).toBe(1)
  })

  it('detecta item ausente (existe no Excel, não no orçamento)', () => {
    const { itens, resumo } = compararComExcel([linhaExcel({ numero: '2' })], [])
    expect(itens[0].status).toBe('ausente')
    expect(itens[0].itemId).toBeNull()
    expect(resumo.ausente).toBe(1)
  })

  it('detecta item sobrando (existe no orçamento, não no Excel)', () => {
    const { itens, resumo } = compararComExcel([], [itemOrc({ numero: '3' })])
    expect(itens[0].status).toBe('sobrando')
    expect(resumo.sobrando).toBe(1)
  })

  it('detecta descrição diferente', () => {
    const { itens } = compararComExcel([linhaExcel({ descricao: 'Alvenaria de bloco' })], [itemOrc({ descricao: 'Alvenaria de tijolo' })])
    expect(itens[0].status).toBe('diferenca')
    expect(itens[0].divergencias.map(d => d.campo)).toContain('descricao')
  })

  it('detecta quantidade diferente, mas tolera arredondamento', () => {
    const { itens: comDiff } = compararComExcel([linhaExcel({ quantidade: 100 })], [itemOrc({ quantidade: 105 })])
    expect(comDiff[0].status).toBe('diferenca')
    expect(comDiff[0].divergencias.map(d => d.campo)).toContain('quantidade')

    const { itens: semDiff } = compararComExcel([linhaExcel({ quantidade: 100.0001 })], [itemOrc({ quantidade: 100 })])
    expect(semDiff[0].status).toBe('confere')
  })

  it('detecta unidade diferente, mas normaliza abreviações equivalentes (M2 vs m²)', () => {
    const { itens: comDiff } = compararComExcel([linhaExcel({ unidade: 'M2' })], [itemOrc({ unidade: 'UN' })])
    expect(comDiff[0].divergencias.map(d => d.campo)).toContain('unidade')

    const { itens: semDiff } = compararComExcel([linhaExcel({ unidade: 'M2' })], [itemOrc({ unidade: 'm²' })])
    expect(semDiff[0].status).toBe('confere')
  })

  it('não compara unidade/quantidade em grupos (sem sentido pra grupo)', () => {
    const { itens } = compararComExcel(
      [linhaExcel({ codigo: null, tipo: 'grupo', unidade: null, quantidade: null })],
      [itemOrc({ unidade: 'UN', quantidade: 10 })] // resíduo hipotético no banco
    )
    expect(itens[0].divergencias.map(d => d.campo)).not.toContain('unidade')
    expect(itens[0].divergencias.map(d => d.campo)).not.toContain('quantidade')
  })

  it('marca duplicidade quando o mesmo número aparece mais de uma vez no orçamento', () => {
    const { itens, resumo } = compararComExcel(
      [linhaExcel({ numero: '5' })],
      [itemOrc({ numero: '5', id: 'a' }), itemOrc({ numero: '5', id: 'b' })]
    )
    expect(itens.every(i => i.status === 'duplicado_orcamento')).toBe(true)
    expect(itens).toHaveLength(2)
    expect(resumo.duplicado).toBe(2)
  })

  it('marca duplicidade quando o mesmo número aparece mais de uma vez no Excel', () => {
    const { itens, resumo } = compararComExcel(
      [linhaExcel({ numero: '6', descricao: 'A' }), linhaExcel({ numero: '6', descricao: 'B' })],
      [itemOrc({ numero: '6' })]
    )
    expect(itens.every(i => i.status === 'duplicado_excel')).toBe(true)
    expect(resumo.duplicado).toBe(2)
  })

  it('nunca usa contagem total como prova: mesmo N de linhas ainda detecta erro dentro', () => {
    const excel = [linhaExcel({ numero: '1', descricao: 'Fundação' }), linhaExcel({ numero: '2', descricao: 'Estrutura' })]
    const orcamento = [itemOrc({ numero: '1', descricao: 'Fundação' }), itemOrc({ numero: '2', descricao: 'Estrutura ERRADA', id: 'id-2' })]
    expect(excel.length).toBe(orcamento.length)
    const { resumo } = compararComExcel(excel, orcamento)
    expect(resumo.diferenca).toBe(1)
    expect(resumo.confere).toBe(1)
  })

  it('desambigua descrições repetidas em pais diferentes pelo número (cenário do pedido original)', () => {
    const excel = [
      linhaExcel({ numero: '1.1', nivel: 2, descricao: 'Armação' }),
      linhaExcel({ numero: '2.1', nivel: 2, descricao: 'Armação' }),
    ]
    const orcamento = [
      itemOrc({ numero: '1.1', nivel: 2, descricao: 'Armação', id: 'fundacao-armacao' }),
      itemOrc({ numero: '2.1', nivel: 2, descricao: 'Armação', id: 'estrutura-armacao' }),
    ]
    const { itens } = compararComExcel(excel, orcamento)
    expect(itens).toHaveLength(2)
    expect(itens.every(i => i.status === 'confere')).toBe(true)
    expect(itens.find(i => i.numero === '1.1')?.itemId).toBe('fundacao-armacao')
    expect(itens.find(i => i.numero === '2.1')?.itemId).toBe('estrutura-armacao')
  })

  it('detecta item fora de ordem', () => {
    // No Excel, aparecem na ordem 1, 2, 3. No orçamento, 2 e 3 estão
    // trocados de lugar (1, 3, 2) -- pelo menos um dos dois precisa ficar
    // marcado como fora de ordem (qual dos dois "leva a culpa" numa troca
    // de posição é uma escolha de implementação, não uma garantia única).
    const excel = [
      linhaExcel({ numero: '1', ordem: 0 }),
      linhaExcel({ numero: '2', ordem: 1 }),
      linhaExcel({ numero: '3', ordem: 2 }),
    ]
    const orcamento = [
      itemOrc({ numero: '1', id: 'a', ordem: 0 }),
      itemOrc({ numero: '3', id: 'c', ordem: 1 }),
      itemOrc({ numero: '2', id: 'b', ordem: 2 }),
    ]
    const { itens } = compararComExcel(excel, orcamento)
    expect(itens.find(i => i.numero === '1')?.foraDeOrdem).toBe(false)
    const algumForaDeOrdem = itens.some(i => (i.numero === '2' || i.numero === '3') && i.foraDeOrdem)
    expect(algumForaDeOrdem).toBe(true)
  })
})
