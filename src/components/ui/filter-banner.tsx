import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

/** Barra contextual mostrada quando a página chega filtrada a partir de um
 * alerta da dashboard (ex.: "insumos sem preço") — deixa claro o que está
 * sendo mostrado e dá um jeito fácil de voltar à lista completa. Mesmo
 * padrão visual de SelectionBar (toolbar.tsx), em tom de aviso (âmbar). */
export function FilterBanner({ label, clearHref }: { label: string; clearHref: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
      <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
        <AlertTriangle size={15} />
        {label}
      </p>
      <Link href={clearHref as any} className="text-sm font-medium text-amber-700 hover:underline">
        Limpar filtro
      </Link>
    </div>
  )
}
