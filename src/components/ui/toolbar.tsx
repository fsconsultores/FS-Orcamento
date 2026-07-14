import type { ReactNode } from 'react'

export function PageHeader({ title, description, actions }: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Linha de filtros rápidos + busca, sempre entre o cabeçalho e a tabela. */
export function Toolbar({ search, filters, className = '' }: {
  search?: ReactNode
  filters?: ReactNode
  className?: string
}) {
  if (!search && !filters) return null
  return (
    <div className={`flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      {search && <div className="sm:max-w-xs sm:flex-1">{search}</div>}
      {filters && <div className="flex flex-wrap items-center gap-1.5">{filters}</div>}
    </div>
  )
}

/** Barra contextual que substitui a Toolbar quando há itens selecionados na tabela. */
export function SelectionBar({ count, onClear, actions }: {
  count: number
  onClear: () => void
  actions?: ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2.5">
      <p className="text-sm font-medium text-primary-800">
        {count} {count === 1 ? 'item selecionado' : 'itens selecionados'}
      </p>
      <div className="flex items-center gap-2">
        {actions}
        <button
          onClick={onClear}
          className="text-sm font-medium text-primary-700 hover:underline"
        >
          Limpar seleção
        </button>
      </div>
    </div>
  )
}
