'use client'

import { useState, useEffect } from 'react'
import { Nav } from './nav'

const STORAGE_KEY = 'sidebar-open'

export function SidebarShell({
  children,
  userEmail,
}: {
  children: React.ReactNode
  userEmail: string
}) {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) setOpen(stored === 'true')
  }, [])

  function toggle() {
    setOpen(prev => {
      localStorage.setItem(STORAGE_KEY, String(!prev))
      return !prev
    })
  }

  return (
    <div className={`min-h-screen bg-gray-50 transition-[padding-left] duration-300 ${open ? 'pl-64' : 'pl-0'}`}>
      <Nav userEmail={userEmail} open={open} onToggle={toggle} />

      {/* Botão flutuante para reabrir quando fechado */}
      {!open && (
        <button
          onClick={toggle}
          className="fixed left-0 top-0 z-50 h-full w-3 bg-gray-200/60 hover:bg-blue-100 hover:w-4 transition-all duration-150 group"
          title="Abrir menu"
        >
          <span className="absolute left-1 top-1/2 -translate-y-1/2 text-gray-400 group-hover:text-blue-600 text-xs select-none">›</span>
        </button>
      )}

      <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
    </div>
  )
}
