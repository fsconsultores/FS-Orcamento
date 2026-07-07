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
  children,
}: {
  title: string
  href?: string
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {href && (
          <Link href={href as any} className="text-xs text-blue-600 hover:underline">
            Ver mais →
          </Link>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

export function WidgetEmpty({ mensagem }: { mensagem: string }) {
  return <p className="text-sm text-gray-400">{mensagem}</p>
}

export function WidgetSkeleton({ title }: { title: string }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm animate-pulse">
      <h3 className="text-sm font-semibold text-gray-300 mb-3">{title}</h3>
      <div className="space-y-2">
        <div className="h-4 bg-gray-100 rounded w-3/4" />
        <div className="h-4 bg-gray-100 rounded w-1/2" />
      </div>
    </div>
  )
}
