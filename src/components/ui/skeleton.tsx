export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-gray-100 ${className}`} />
}

/** Loading state padrão de telas de listagem (cabeçalho + toolbar + tabela) — usado nos `loading.tsx` de rota. */
export function ListPageSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="h-10 border-b border-gray-200 bg-gray-50" />
        <div className="divide-y divide-gray-100">
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex items-center gap-4 px-4 py-3">
              {Array.from({ length: cols }).map((_, c) => (
                <Skeleton key={c} className={`h-4 ${c === 0 ? 'w-20' : c === 1 ? 'flex-1' : 'w-16'}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
