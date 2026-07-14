'use client'

import { useState, useEffect } from 'react'
import { Nav } from './nav'
import { Header } from './header'
import { ToastProvider } from './ui/toast'

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
    <ToastProvider>
      <div className="min-h-screen bg-gray-50 transition-[padding-left] duration-200" style={{ paddingLeft: open ? 288 : 64 }}>
        <Nav open={open} onToggle={toggle} />
        <Header userEmail={userEmail} />
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </div>
    </ToastProvider>
  )
}
