import type { ReactNode } from 'react'

export type TimelineTone = 'neutral' | 'primary' | 'success' | 'error' | 'warning'

const TONE_CLS: Record<TimelineTone, string> = {
  neutral: 'bg-gray-100 text-gray-500',
  primary: 'bg-primary-100 text-primary-700',
  success: 'bg-emerald-100 text-emerald-600',
  error: 'bg-red-100 text-red-600',
  warning: 'bg-amber-100 text-amber-600',
}

export function Timeline({ children }: { children: ReactNode }) {
  return <div>{children}</div>
}

/** Um nó da linha do tempo — usado por Logs e Versões para uma linguagem visual única
 * de "histórico de eventos". `isLast` evita desenhar o conector abaixo do último item. */
export function TimelineItem({ icon, tone = 'neutral', isLast, children }: {
  icon: ReactNode
  tone?: TimelineTone
  isLast?: boolean
  children: ReactNode
}) {
  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <span className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONE_CLS[tone]}`}>
          {icon}
        </span>
        {!isLast && <span className="w-px flex-1 bg-gray-200" style={{ minHeight: 12 }} />}
      </div>
      <div className={`min-w-0 flex-1 ${isLast ? 'pb-1' : 'pb-5'}`}>{children}</div>
    </div>
  )
}
