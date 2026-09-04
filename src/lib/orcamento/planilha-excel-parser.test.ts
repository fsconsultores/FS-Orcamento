import { describe, it, expect } from 'vitest'
import { normNum, getLevel, parseMatrix, type Mapeamento } from './planilha-excel-parser'

// Achado real: planilha "Topo de Minas" (cad orçamento_Topo-Minas_R02_exe.xlsx,
// aba "ORÇAMENTO EXE") escreve o capítulo de nível 1 como "1." (com ponto
// final) e os filhos como "1.1", "1.2" — sem o ponto. Sem o fix, normNum("1.")
// virava "1.NaN" (split por "." gera um segmento vazio, parseInt("") é NaN),
// colocando o capítulo no MESMO nível dos próprios filhos e quebrando o
// parent_id de toda a árvore na importação (capítulo e filhos ficavam órfãos).
describe('normNum', () => {
  it('normaliza número com ponto final (capítulo) igual ao mesmo número sem ponto', () => {
    expect(normNum('1.')).toBe('1')
    expect(normNum('12.')).toBe('12')
  })

  it('não afeta números normais de múltiplos níveis', () => {
    expect(normNum('1.1')).toBe('1.1')
    expect(normNum('3.1.1')).toBe('3.1.1')
  })

  it('remove zeros à esquerda de cada segmento', () => {
    expect(normNum('01.02')).toBe('1.2')
  })
})

describe('getLevel', () => {
  it('capítulo com ponto final fica no nível 1, igual ao mesmo capítulo sem ponto', () => {
    expect(getLevel(normNum('1.'))).toBe(1)
    expect(getLevel(normNum('1'))).toBe(1)
  })

  it('filho de um capítulo com ponto final fica um nível abaixo do pai', () => {
    const nivelPai = getLevel(normNum('1.'))
    const nivelFilho = getLevel(normNum('1.1'))
    expect(nivelFilho).toBe(nivelPai + 1)
  })
})

describe('parseMatrix — hierarquia com capítulo terminado em ponto', () => {
  const mapa: Mapeamento = { numero: 0, codigo: null, descricao: 1, unidade: null, quantidade: null, custo_unitario: null }

  it('capítulo "1." e filho "1.1" saem com níveis consistentes (1 e 2)', () => {
    const matrix = [
      ['ITEM', 'DESCRIÇÃO'],
      ['1.', 'TAXA DE ADMINISTRAÇÃO'],
      ['1.1', 'TAXA DE ADMINISTRAÇÃO - Custo fixo mensal'],
      ['2.', 'CANTEIRO DE OBRAS'],
      ['2.1', 'PLACA DE OBRA'],
    ]
    const { rows, ignoradas } = parseMatrix(matrix, mapa, 1)
    expect(ignoradas).toHaveLength(0)
    expect(rows.map(r => ({ numero: r.numero, nivel: r.nivel }))).toEqual([
      { numero: '1.', nivel: 1 },
      { numero: '1.1', nivel: 2 },
      { numero: '2.', nivel: 1 },
      { numero: '2.1', nivel: 2 },
    ])
  })
})
