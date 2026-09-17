import { describe, it, expect } from 'vitest'
import { parseLocaleNumber } from './parse-locale-number'

describe('parseLocaleNumber', () => {
  it('formato BR: vírgula decimal, sem milhar', () => {
    expect(parseLocaleNumber('650,62')).toBe(650.62)
  })

  it('formato BR: ponto milhar + vírgula decimal', () => {
    expect(parseLocaleNumber('1.650,62')).toBe(1650.62)
  })

  it('formato internacional: ponto decimal, sem milhar', () => {
    expect(parseLocaleNumber('650.62')).toBe(650.62)
  })

  it('formato internacional: ponto decimal com dígito a mais (achado real)', () => {
    expect(parseLocaleNumber('650.620')).toBe(650.62)
  })

  it('formato SheetJS sheet_to_csv: vírgula milhar + ponto decimal', () => {
    expect(parseLocaleNumber('1,650.62')).toBe(1650.62)
  })

  it('sem separador nenhum', () => {
    expect(parseLocaleNumber('650')).toBe(650)
  })
})
