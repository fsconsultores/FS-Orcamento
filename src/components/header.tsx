'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Bell, Plus, LogOut, Circle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside])
  return ref
}

export function Header({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  // "Novo orçamento" some quando já se está dentro de um projeto específico
  // (/orcamentos/[id]/...) — ali o atalho relevante é para o projeto atual,
  // não para criar um novo.
  const segments = pathname.split('/').filter(Boolean)
  const dentroDeProjeto = segments[0] === 'orcamentos' && segments[1] && segments[1] !== 'novo'

  const userRef = useClickOutside(() => setUserMenuOpen(false))
  const notifRef = useClickOutside(() => setNotifOpen(false))

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    startTransition(() => {
      router.push('/login')
      router.refresh()
    })
  }

  const initials = (userEmail || '?').slice(0, 2).toUpperCase()

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-6">
      <div className="flex-1" />

      {/* Ação rápida — só faz sentido fora de um projeto específico */}
      {!dentroDeProjeto && (
        <Link
          href={'/orcamentos/novo' as any}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-800"
        >
          <Plus size={14} /> Novo orçamento
        </Link>
      )}

      {/* Status do sistema */}
      <span className="hidden items-center gap-1.5 text-xs text-gray-400 sm:inline-flex">
        <Circle size={7} className="fill-emerald-500 text-emerald-500" />
        Conectado
      </span>

      {/* Notificações */}
      <div ref={notifRef} className="relative">
        <button
          onClick={() => setNotifOpen(o => !o)}
          className="rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="Notificações"
        >
          <Bell size={17} />
        </button>
        {notifOpen && (
          <div className="absolute right-0 top-full z-40 mt-1 w-64 rounded-md border border-gray-200 bg-white p-4 text-center shadow-lg">
            <p className="text-sm text-gray-400">Nenhuma notificação por enquanto.</p>
          </div>
        )}
      </div>

      {/* Usuário */}
      <div ref={userRef} className="relative">
        <button
          onClick={() => setUserMenuOpen(o => !o)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700 transition-colors hover:bg-primary-200"
        >
          {initials}
        </button>
        {userMenuOpen && (
          <div className="absolute right-0 top-full z-40 mt-1 w-56 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
            <p className="truncate border-b border-gray-100 px-3 py-2 text-xs text-gray-500">{userEmail}</p>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-600 transition-colors hover:bg-gray-50"
            >
              <LogOut size={15} /> Sair
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
