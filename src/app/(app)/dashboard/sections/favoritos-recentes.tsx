import Link from 'next/link'
import { Star, Package, Layers3, FolderKanban } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import type { FavoritoRecenteItem } from '@/lib/dashboard/queries'

const ICONS = {
  insumo: Package,
  composicao: Layers3,
  orcamento: FolderKanban,
} as const

const LABELS = {
  insumo: 'Insumo',
  composicao: 'Composição',
  orcamento: 'Orçamento',
} as const

export function FavoritosRecentes({ items }: { items: FavoritoRecenteItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Star size={18} />}
        title="Nenhum favorito ainda"
        description="Toque na estrela ☆ em insumos, composições ou orçamentos para vê-los aqui."
      />
    )
  }

  return (
    <div className="divide-y divide-gray-100">
      {items.map((item) => {
        const Icon = ICONS[item.entityType]
        return (
          <Link
            key={`${item.entityType}-${item.id}`}
            href={item.href as any}
            className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 hover:bg-gray-50 -mx-2 px-2 rounded-md transition-colors"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{item.label}</p>
              <p className="truncate text-xs text-gray-400">
                {LABELS[item.entityType]}{item.sublabel ? ` · ${item.sublabel}` : ''}
              </p>
            </div>
            <Star size={13} className="shrink-0 text-amber-400" fill="currentColor" />
          </Link>
        )
      })}
    </div>
  )
}
