'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Recarrega os dados do dashboard a cada 5s — é só um `router.refresh()`. */
export function AutoRefresh() {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(id)
  }, [router])
  return <span className="text-xs text-gray-400">atualiza a cada 5s</span>
}
