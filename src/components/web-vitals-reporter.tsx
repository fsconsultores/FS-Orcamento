'use client'

import { useReportWebVitals } from 'next/web-vitals'
import { usePathname } from 'next/navigation'
import { queueVitalMetric } from '@/lib/dev-metrics/client-report'

/**
 * Coleta LCP/CLS/INP/TTFB/FCP via o hook nativo do Next.js e alimenta o
 * store dev-only (dashboard /dev/performance). Só é montado em
 * desenvolvimento (ver (app)/layout.tsx) — não existe no bundle de produção.
 */
export function WebVitalsReporter() {
  const pathname = usePathname()
  useReportWebVitals((metric) => {
    queueVitalMetric({ name: metric.name, value: metric.value, path: pathname, timestamp: Date.now() })
  })
  return null
}
