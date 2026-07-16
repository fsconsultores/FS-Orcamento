'use client'

import { useRouter } from 'next/navigation'

/** Zera o store de métricas — útil antes de rodar um benchmark isolado. */
export function ClearButton() {
  const router = useRouter()
  async function handleClick() {
    await fetch('/api/dev/metrics/clear', { method: 'POST' })
    router.refresh()
  }
  return (
    <button
      onClick={handleClick}
      className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
    >
      Limpar dados
    </button>
  )
}
