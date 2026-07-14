import type { ReactNode } from 'react'

export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-center">
      {icon && (
        <div className="mb-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-400">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {description && <p className="max-w-sm text-sm text-gray-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
