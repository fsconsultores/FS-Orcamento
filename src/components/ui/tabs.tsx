import Link from 'next/link'
import type { Route } from 'next'

export interface TabItem {
  key: string
  label: string
  href: string
  active: boolean
}

export function Tabs({ items, className = '' }: { items: TabItem[]; className?: string }) {
  return (
    <div className={`flex gap-0 border-b border-gray-200 ${className}`}>
      {items.map(item => (
        <Link
          key={item.key}
          href={item.href as Route}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            item.active
              ? 'border-primary-700 text-primary-700'
              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  )
}
