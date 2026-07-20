import Link from 'next/link'
import { FolderKanban } from 'lucide-react'
import { ProjectCard } from '@/components/ui/project-card'
import { EmptyState } from '@/components/ui/empty-state'
import type { BadgeVariant } from '@/components/ui/badge'

export interface ProjetoRecenteItem {
  id: string
  nome: string
  cliente: string | null
  valor: number
  dataRelativa: string
  statusLabel: string
  statusVariant: BadgeVariant
}

export function ProjetosRecentes({ items }: { items: ProjetoRecenteItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<FolderKanban size={18} />}
        title="Nenhum orçamento ainda"
        description="Crie o primeiro orçamento para começar a orçar."
        action={
          <Link href="/orcamentos/novo" className="text-sm font-medium text-primary-700 hover:underline">
            Novo orçamento →
          </Link>
        }
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((p) => (
        <ProjectCard
          key={p.id}
          id={p.id}
          nome={p.nome}
          cliente={p.cliente}
          valor={p.valor}
          dataRelativa={p.dataRelativa}
          statusLabel={p.statusLabel}
          statusVariant={p.statusVariant}
        />
      ))}
    </div>
  )
}
