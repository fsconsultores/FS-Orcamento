'use client'

import { Profiler, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { queueRenderMetric } from '@/lib/dev-metrics/client-report'

const DEV = process.env.NODE_ENV === 'development'
// Só loga individualmente renders que estourem o orçamento de 1 frame
// (~16ms) — ruído de renders baratos (ex: hover, seleção de célula) não
// interessa aqui. Todo render é reportado ao store independente disso, para
// o dashboard poder contar quantas vezes cada componente renderizou.
const LIMIAR_MS = 16

// Heurística de "renderiza demais": muitos renders do MESMO id num
// intervalo curto — sinal de props/callbacks instáveis ou de um efeito
// disparando em loop. Não é uma contagem "por navegação" exata (reseta por
// tempo, não por navegação), mas é barato e pega o caso real que importa.
const RENDER_COUNT_WINDOW_MS = 3000
const RENDER_COUNT_LIMIAR = 20
const renderTimestampsById = new Map<string, number[]>()

// Heurística de "cascata": vários componentes DIFERENTES renderizando no
// mesmo instante (mesmo commit ou commits muito próximos) — típico de um
// setState num ancestral comum sem memoização suficiente nos filhos.
const CASCADE_WINDOW_MS = 50
const CASCADE_MIN_IDS = 3
let recentCascadeEvents: { id: string; at: number }[] = []

function checkExcessRenders(id: string, now: number) {
  const arr = (renderTimestampsById.get(id) ?? []).filter(t => now - t < RENDER_COUNT_WINDOW_MS)
  arr.push(now)
  renderTimestampsById.set(id, arr)
  if (arr.length === RENDER_COUNT_LIMIAR) {
    console.warn(`[perf] ⚠️ ${id} renderizou ${arr.length}x em ${RENDER_COUNT_WINDOW_MS}ms — possível prop/callback instável ou loop`)
  }
}

function checkCascade(id: string, now: number) {
  recentCascadeEvents = recentCascadeEvents.filter(e => now - e.at < CASCADE_WINDOW_MS)
  recentCascadeEvents.push({ id, at: now })
  const distinctIds = new Set(recentCascadeEvents.map(e => e.id))
  if (distinctIds.size === CASCADE_MIN_IDS) {
    console.warn(`[perf] ⚠️ cascata de renders: ${[...distinctIds].join(', ')} renderizaram dentro de ${CASCADE_WINDOW_MS}ms`)
  }
}

/**
 * Envolve uma tela pesada com React Profiler em desenvolvimento para medir
 * tempo de render sem custo em produção (vira passthrough — Profiler nem é
 * importado no client bundle de prod graças ao branch estático abaixo).
 */
export function DevProfiler({ id, children }: { id: string; children: ReactNode }) {
  const pathname = usePathname()
  if (!DEV) return <>{children}</>

  return (
    <Profiler
      id={id}
      onRender={(profId, phase, actualDuration) => {
        const now = performance.now()
        if (actualDuration > LIMIAR_MS) {
          console.log(`[perf] render ${profId} (${phase}): ${actualDuration.toFixed(1)}ms`)
        }
        checkExcessRenders(profId, now)
        checkCascade(profId, now)
        queueRenderMetric({
          id: profId,
          phase: phase as 'mount' | 'update' | 'nested-update',
          actualDuration,
          path: pathname,
          timestamp: Date.now(),
        })
      }}
    >
      {children}
    </Profiler>
  )
}
