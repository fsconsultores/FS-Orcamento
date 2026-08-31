import { describe, it, expect } from 'vitest'
import { mesclarVariantesCategoria } from './categorias-insumo'

describe('mesclarVariantesCategoria', () => {
  it('mantém categorias distintas separadas', () => {
    const r = mesclarVariantesCategoria([
      { categoria: 'Abajur', usos: 3 },
      { categoria: 'Luminária', usos: 2 },
    ])
    expect(r).toHaveLength(2)
  })

  it('funde maiúscula/minúscula na mesma categoria, somando os usos', () => {
    const r = mesclarVariantesCategoria([
      { categoria: 'Abajur', usos: 5 },
      { categoria: 'ABAJUR', usos: 2 },
      { categoria: 'abajur', usos: 1 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].usos).toBe(8)
  })

  it('usa a variante mais usada como rótulo de exibição', () => {
    const r = mesclarVariantesCategoria([
      { categoria: 'abajur', usos: 1 },
      { categoria: 'Abajur', usos: 10 },
      { categoria: 'ABAJUR', usos: 2 },
    ])
    expect(r[0].categoria).toBe('Abajur')
  })

  it('funde acento (Luminária vs Luminaria)', () => {
    const r = mesclarVariantesCategoria([
      { categoria: 'Luminária', usos: 4 },
      { categoria: 'Luminaria', usos: 1 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].usos).toBe(5)
  })

  it('funde espaço extra nas pontas/no meio', () => {
    const r = mesclarVariantesCategoria([
      { categoria: 'Abajur', usos: 3 },
      { categoria: '  Abajur  ', usos: 1 },
      { categoria: 'Aba jur', usos: 1 },
    ])
    // "Aba jur" (espaço no meio, uma palavra a mais) é vocabulário
    // diferente de "Abajur" — não deve fundir, só a normalização mecânica
    // (trim/espaço duplicado) deve.
    expect(r).toHaveLength(2)
    const abajur = r.find(c => c.categoria.trim() === 'Abajur')
    expect(abajur?.usos).toBe(4)
  })

  it('NÃO funde sinônimos/variações de vocabulário — só normalização mecânica', () => {
    const r = mesclarVariantesCategoria([
      { categoria: 'Abajur', usos: 5 },
      { categoria: 'Abajures', usos: 2 },
      { categoria: 'Abajur decorativo', usos: 1 },
    ])
    expect(r).toHaveLength(3)
  })

  it('ordena por total de usos, decrescente', () => {
    const r = mesclarVariantesCategoria([
      { categoria: 'Pouco usada', usos: 1 },
      { categoria: 'Muito usada', usos: 50 },
      { categoria: 'Meio termo', usos: 10 },
    ])
    expect(r.map(c => c.categoria)).toEqual(['Muito usada', 'Meio termo', 'Pouco usada'])
  })

  it('lista vazia não quebra', () => {
    expect(mesclarVariantesCategoria([])).toEqual([])
  })
})
