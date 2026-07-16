import { NextResponse } from 'next/server'
import { clearMetrics } from '@/lib/dev-metrics/store'

export async function POST() {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  clearMetrics()
  return NextResponse.json({ ok: true })
}
