import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Casca visual compartilhada pelos widgets do dashboard — puramente
 * apresentacional, não carrega dado nenhum. Cada widget busca e renderiza
 * seu próprio conteúdo de forma independente; isto só padroniza título/borda.
 */
export function WidgetCard({
  title,
  href,
  icon,
  wide,
  children,
}: {
  title: string
  href?: string
  icon?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col ${wide ? 'sm:col-span-2 lg:col-span-3' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              {icon}
            </span>
          )}
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        </div>
        {href && (
          <Link href={href as any} className="text-xs font-medium text-blue-600 hover:underline shrink-0">
            Ver mais →
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

/** Variante maior para os KPIs de abertura (Projetos, Valor total) — mesmo número, mais peso visual. */
export function WidgetStat({
  title,
  href,
  icon,
  value,
  caption,
}: {
  title: string
  href?: string
  icon?: ReactNode
  value: ReactNode
  caption?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          {icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              {icon}
            </span>
          )}
          <h3 className="text-sm font-semibold text-gray-600">{title}</h3>
        </div>
        {href && (
          <Link href={href as any} className="text-xs font-medium text-blue-600 hover:underline shrink-0">
            Ver mais →
          </Link>
        )}
      </div>
      <p className="text-3xl font-bold text-gray-900 tabular-nums leading-none">{value}</p>
      {caption && <p className="mt-2 text-xs text-gray-400">{caption}</p>}
    </div>
  )
}

export function WidgetEmpty({ mensagem }: { mensagem: string }) {
  return <p className="text-sm text-gray-400">{mensagem}</p>
}

export function WidgetSkeleton({ title, stat }: { title: string; stat?: boolean }) {
  if (stat) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse">
        <div className="mb-4 flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-gray-100" />
          <h3 className="text-sm font-semibold text-gray-300">{title}</h3>
        </div>
        <div className="h-8 w-2/3 bg-gray-100 rounded" />
        <div className="mt-3 h-3 w-1/3 bg-gray-100 rounded" />
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm animate-pulse">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">{title}</h3>
      <div className="space-y-2">
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
        <div className="h-4 bg-gray-100 rounded w-2/3" />
      </div>
    </div>
  )
}
