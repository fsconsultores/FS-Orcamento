import type { ReactNode } from 'react'
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

type Variant = 'success' | 'warning' | 'error'

const VARIANT_CLS: Record<Variant, { box: string; icon: string; title: string }> = {
  success: { box: 'border-emerald-200 bg-emerald-50', icon: 'text-emerald-500', title: 'text-emerald-800' },
  warning: { box: 'border-amber-200 bg-amber-50', icon: 'text-amber-500', title: 'text-amber-800' },
  error: { box: 'border-red-200 bg-red-50', icon: 'text-red-500', title: 'text-red-800' },
}

const ICONS: Record<Variant, typeof CheckCircle2> = { success: CheckCircle2, warning: AlertTriangle, error: XCircle }

/** Banner de resultado de importação — mesma casca visual usada nas telas de import de insumos/composições/bases. */
export function ImportResultBox({ variant, title, children }: { variant: Variant; title: string; children?: ReactNode }) {
  const cls = VARIANT_CLS[variant]
  const Icon = ICONS[variant]
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${cls.box}`}>
      <Icon size={18} className={`mt-0.5 shrink-0 ${cls.icon}`} />
      <div className="space-y-1">
        <p className={`text-sm font-semibold ${cls.title}`}>{title}</p>
        {children && <div className="text-sm text-gray-600">{children}</div>}
      </div>
    </div>
  )
}
