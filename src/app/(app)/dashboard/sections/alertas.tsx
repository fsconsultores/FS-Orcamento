import { CheckCircle2 } from 'lucide-react'
import { AlertCard } from '@/components/ui/alert-card'
import type { Alerta } from '@/lib/dashboard/alertas'

export function Alertas({ items }: { items: Alerta[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        <CheckCircle2 size={16} />
        Nenhum alerta no momento — tudo em dia.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {items.map((a) => (
        <AlertCard key={a.key} variant={a.variant} title={a.titulo} description={a.descricao} href={a.href} />
      ))}
    </div>
  )
}
