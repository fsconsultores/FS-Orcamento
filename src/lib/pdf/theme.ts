/**
 * Tema visual PDF — derivado do Design System (src/design-system/tokens.ts).
 * Camada puramente de apresentação; sem lógica de negócio ou acesso a dados.
 */
import { brandPrimary, brandSecondary } from '@/design-system/tokens'

/** Identidade de marca para o Caderno de Orçamento (capa, divisórias, KPIs). */
export const CADERNO_BRAND = {
  primary: brandPrimary.purple,
  secondary: brandPrimary.blue,
  violet: brandPrimary.violet,
  indigo: brandPrimary.indigo,
  kpiPrimary: {
    bg: brandPrimary.blue,
    fg: '#ffffff',
    subFg: '#c7d2f0',
  },
} as const

/** Paleta compartilhada por todos os exports PDF (planilhas avulsas, Curva ABC, etc.). */
export const PDF_COLORS = {
  bannerBg: brandPrimary.purple,
  bannerFg: '#ffffff',
  bannerSubtitle: brandSecondary.silver,
  totalBg: brandPrimary.blue,
  totalFg: '#ffffff',
  totalSubFg: '#c7d2f0',
  textPrimary: brandSecondary.charcoal,
  textMuted: brandSecondary.silver,
  accentCyan: brandSecondary.cyan,
  accentAmber: brandSecondary.amber,
  a: { bg: '#ecfdf5', fg: '#047857', sub: '#34d399' },
  b: { bg: '#fffbeb', fg: brandSecondary.amber, sub: '#fbbf24' },
  c: { bg: '#fff1f2', fg: '#be123c', sub: '#fb7185' },
  zoneA: '#f0fdf4',
  zoneB: '#fffbeb',
  zoneC: '#fff1f2',
  gridLight: brandSecondary.silver,
  gridStrong: '#9ca3af',
  axis: '#d1d5db',
  line: brandPrimary.blue,
  green: '#16a34a',
  amber: brandSecondary.amber,
  rose: '#dc2626',
  textGray: brandSecondary.charcoal,
  tableGroupFill: '#f1f5f9',
  tableBorder: '#cbd5e1',
  tableFootFill: '#f1f5f9',
  tableFootText: brandSecondary.charcoal,
} as const

export type PdfColorPalette = typeof PDF_COLORS
