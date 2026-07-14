import type { ReactNode } from 'react'

export function StatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
}

export function StatCard({ label, value, icon, hint }: {
  label: string
  value: ReactNode
  icon?: ReactNode
  hint?: ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
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
}
