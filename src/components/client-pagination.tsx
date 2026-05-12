'use client'

interface ClientPaginationProps {
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
}

export function ClientPagination({ total, page, pageSize, onPageChange }: ClientPaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

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
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-2.5 py-1.5 rounded text-sm border transition-colors disabled:text-gray-300 disabled:border-gray-200 text-gray-600 border-gray-200 hover:bg-gray-50 disabled:cursor-default"
        >
          ‹
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="px-1.5 py-1.5 text-sm text-gray-400 select-none">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={`min-w-[36px] text-center px-2.5 py-1.5 rounded text-sm border transition-colors ${
                p === page
                  ? 'bg-blue-600 text-white border-blue-600 font-medium'
                  : 'text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="px-2.5 py-1.5 rounded text-sm border transition-colors disabled:text-gray-300 disabled:border-gray-200 text-gray-600 border-gray-200 hover:bg-gray-50 disabled:cursor-default"
        >
          ›
        </button>
      </div>
    </div>
  )
}
