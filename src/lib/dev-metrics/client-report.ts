'use client'

import type { RenderMetric, VitalMetric, NavMetric } from './store'

// Buffer + flush em lote (client → servidor) para não disparar uma
// requisição HTTP por render — numa sessão de edição rápida isso seria
// centenas de POSTs por minuto. Junta 1.5s de eventos e manda de uma vez.
let renderBuffer: RenderMetric[] = []
let vitalBuffer: VitalMetric[] = []
let navBuffer: NavMetric[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function flush() {
  flushTimer = null
  if (renderBuffer.length === 0 && vitalBuffer.length === 0 && navBuffer.length === 0) return
  const payload = JSON.stringify({ renders: renderBuffer, vitals: vitalBuffer, navs: navBuffer })
  renderBuffer = []
  vitalBuffer = []
  navBuffer = []
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon('/api/dev/metrics', new Blob([payload], { type: 'application/json' }))
  } else {
    fetch('/api/dev/metrics', { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {})
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(flush, 1500)
}

export function queueRenderMetric(m: RenderMetric) {
  renderBuffer.push(m)
  scheduleFlush()
}

export function queueVitalMetric(m: VitalMetric) {
  vitalBuffer.push(m)
  scheduleFlush()
}

export function queueNavMetric(m: NavMetric) {
  navBuffer.push(m)
  scheduleFlush()
}
