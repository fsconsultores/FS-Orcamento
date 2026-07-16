'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { queueNavMetric } from '@/lib/dev-metrics/client-report'

/**
 * Registra cada troca de pathname no cliente. Comparado no dashboard com
 * PageLoadMetric (observado no servidor) para estimar cache hit/miss do
 * Router Cache — uma navegação sem carga correspondente no servidor não
 * chegou a rodar Server Components (serviu do cache do navegador).
 */
export function NavTracker() {
  const pathname = usePathname()
  useEffect(() => {
    queueNavMetric({ path: pathname, timestamp: Date.now() })
  }, [pathname])
  return null
}
