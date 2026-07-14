import type { ReactNode } from 'react'

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'brand'

const VARIANT_CLS: Record<BadgeVariant, string> = {
  neutral: 'bg-gray-100 text-gray-600 border-gray-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-secondary-50 text-secondary-700 border-secondary-200',
  brand: 'bg-primary-50 text-primary-700 border-primary-200',
}

export function Badge({ variant = 'neutral', className = '', children }: { variant?: BadgeVariant; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${VARIANT_CLS[variant]} ${className}`}>
      {children}
    </span>
  )
}

// Mapeamento canônico de cor para Classe ABC (A=verde/B=âmbar/C=vermelho) —
// mesmo critério já usado na aba Curva ABC. export-caderno-pdf.ts tinha essa
// classificação invertida (bug real, corrigido junto com esta reformulação).
export type AbcClasseUi = 'A' | 'B' | 'C'
const ABC_VARIANT: Record<AbcClasseUi, BadgeVariant> = { A: 'success', B: 'warning', C: 'error' }

export function AbcBadge({ classe, className = '' }: { classe: AbcClasseUi; className?: string }) {
  return <Badge variant={ABC_VARIANT[classe]} className={className}>{classe}</Badge>
}
