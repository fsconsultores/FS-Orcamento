import Link from 'next/link'
import type { ReactNode } from 'react'

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
}

/** Card de KPI — `size="sm"` (default) é o usado em telas de listagem (ex: Bases de
 * Dados); `size="lg"` é a variante de abertura, mais peso visual, usada nos KPIs do
 * topo da dashboard. `href` torna o card inteiro clicável. */
export function StatCard({ label, value, icon, hint, href, size = 'sm' }: {
  label: string
  value: ReactNode
  icon?: ReactNode
  hint?: ReactNode
  href?: string
  size?: 'sm' | 'lg'
}) {
  const hoverCls = href ? 'transition-shadow hover:shadow-md' : ''

  const content = size === 'lg' ? (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${hoverCls}`}>
      <div className="mb-3 flex items-center gap-2.5">
        {icon && (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            {icon}
          </span>
        )}
        <p className="text-sm font-semibold text-gray-700">{label}</p>
      </div>
      <p className="text-3xl font-bold leading-none text-gray-900 tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-xs text-gray-400">{hint}</p>}
    </div>
  ) : (
    <div className={`flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm ${hoverCls}`}>
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-gray-500">{label}</p>
        <p className="truncate text-lg font-semibold text-gray-900 tabular-nums">{value}</p>
        {hint && <p className="truncate text-xs text-gray-400">{hint}</p>}
      </div>
    </div>
  )

  return href ? <Link href={href as any}>{content}</Link> : content
}
