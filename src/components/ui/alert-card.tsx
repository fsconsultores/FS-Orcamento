import Link from 'next/link'
import type { ReactNode } from 'react'
import { AlertTriangle, AlertCircle } from 'lucide-react'

export type AlertVariant = 'warning' | 'error'

const VARIANT_CLS: Record<AlertVariant, { icon: string; border: string }> = {
  warning: { icon: 'bg-amber-50 text-amber-600', border: 'hover:border-amber-300' },
  error: { icon: 'bg-red-50 text-red-600', border: 'hover:border-red-300' },
}

export function AlertCard({ variant, title, description, href }: {
  variant: AlertVariant
  title: ReactNode
  description?: ReactNode
  href: string
}) {
  const cls = VARIANT_CLS[variant]
  const Icon = variant === 'error' ? AlertCircle : AlertTriangle
  return (
    <Link
      href={href as any}
      className={`flex items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm transition-colors ${cls.border}`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cls.icon}`}>
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{title}</p>
        {description && <p className="truncate text-xs text-gray-400">{description}</p>}
      </div>
    </Link>
  )
}
