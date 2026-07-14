import Link from 'next/link'
import type { Route } from 'next'

interface PaginationProps {
  total: number
  page: number
  pageSize: number
  baseHref: string  // current URL without the 'page' param
}

export function Pagination({ total, page, pageSize, baseHref }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const sep = baseHref.includes('?') ? '&' : '?'

  function pageUrl(p: number): Route {
    if (p === 1) return (baseHref || '/') as Route
    return `${baseHref}${sep}page=${p}` as Route
  }

  const pages: (number | '...')[] = []
  if (totalPages <= 9) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 4) pages.push('...')
    for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) pages.push(i)
    if (page < totalPages - 3) pages.push('...')
    pages.push(totalPages)
  }

  const from = Math.min((page - 1) * pageSize + 1, total)
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between px-1 py-2">
      <p className="text-sm text-gray-500">
        {from.toLocaleString('pt-BR')}–{to.toLocaleString('pt-BR')} de{' '}
        <span className="font-medium text-gray-700">{total.toLocaleString('pt-BR')}</span>
      </p>
      <div className="flex items-center gap-1">
        <Link
          href={pageUrl(page - 1)}
          aria-disabled={page <= 1}
          className={`px-2.5 py-1.5 rounded text-sm border transition-colors ${
            page <= 1
              ? 'pointer-events-none text-gray-300 border-gray-200'
              : 'text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          ‹
        </Link>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="px-1.5 py-1.5 text-sm text-gray-400 select-none">
              …
            </span>
          ) : (
            <Link
              key={p}
              href={pageUrl(p as number)}
              className={`min-w-[36px] text-center px-2.5 py-1.5 rounded text-sm border transition-colors ${
                p === page
                  ? 'bg-primary-700 text-white border-primary-700 font-medium'
                  : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p}
            </Link>
          )
        )}

        <Link
          href={pageUrl(page + 1)}
          aria-disabled={page >= totalPages}
          className={`px-2.5 py-1.5 rounded text-sm border transition-colors ${
            page >= totalPages
              ? 'pointer-events-none text-gray-300 border-gray-200'
              : 'text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          ›
        </Link>
      </div>
    </div>
  )
}
