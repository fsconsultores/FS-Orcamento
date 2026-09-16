import Link from 'next/link'
import type { ReactNode } from 'react'

export function StatRow({ children }: { children: ReactNode }) {
  // xl (1280px), não sm (640px): entre esses dois pontos o conteúdo
  // disponível (descontada a sidebar) ainda é estreito demais pra 4 cards
  // lado a lado sem espremer o texto — 2 colunas dá respiro real ao label.
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{children}</div>
}

/** Card de KPI — `size="sm"` (default) é o usado em telas de listagem (ex: Bases de
 * Dados); `size="lg"` é a variante de abertura, mais peso visual, usada nos KPIs do
 * topo da dashboard. `href` torna o card inteiro clicável. `accent` (só em `size="lg"`)
 * dá destaque a UM card entre os 4 — reservado pro número mais importante da tela
 * (ex.: Valor total orçado), nunca mais de um por linha, senão perde o efeito. */
export function StatCard({ label, value, icon, hint, href, size = 'sm', accent = false }: {
  label: string
  value: ReactNode
  icon?: ReactNode
  hint?: ReactNode
  href?: string
  size?: 'sm' | 'lg'
  accent?: boolean
}) {
  const hoverCls = href ? 'transition-shadow hover:shadow-md' : ''

  const content = size === 'lg' ? (
    <div className={`min-w-0 rounded-xl border bg-white p-5 shadow-sm ${accent ? 'border-primary-200 border-l-4 border-l-primary-600' : 'border-gray-200'} ${hoverCls}`}>
      <div className="mb-3 flex items-center gap-2.5">
        {icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accent ? 'bg-primary-600 text-white' : 'bg-primary-50 text-primary-700'}`}>
            {icon}
          </span>
        )}
        <p className="truncate text-sm font-semibold text-gray-700">{label}</p>
      </div>
      {/* min-w-0 acima + break-words (não truncate) aqui: deixa o valor
          quebrar linha — primeiro no espaço depois de "R$" (formatCurrency
          sempre inclui esse espaço), e se mesmo assim um bloco de dígitos
          não couber na coluna, break-words quebra NELE também (nunca
          deixando parte invisível) — nenhum número grande deve ficar
          ilegível ou cortado. min-w-0 sozinho já evita a coluna do grid
          crescer/estourar a caixa (o texto quebra dentro da largura alocada
          em vez de empurrá-la). leading-tight (não mais leading-none) dá
          respiro caso quebre em 2+ linhas. */}
      <p
        className={`break-words text-xl font-bold leading-tight tabular-nums sm:text-2xl lg:text-3xl ${accent ? 'text-primary-800' : 'text-gray-900'}`}
      >
        {value}
      </p>
      {hint && <p className="mt-2 break-words text-xs text-gray-400">{hint}</p>}
    </div>
  ) : (
    <div className={`flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm ${hoverCls}`}>
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-500" title={label}>{label}</p>
        <p className="break-words text-lg font-semibold text-gray-900 tabular-nums">{value}</p>
        {hint && <p className="break-words text-xs text-gray-400">{hint}</p>}
      </div>
    </div>
  )

  return href ? <Link href={href as any}>{content}</Link> : content
}
