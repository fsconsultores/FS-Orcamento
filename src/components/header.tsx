'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Bell, Plus, LogOut, Circle } from 'lucide-react'
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

interface SearchResult { id: string; nome_obra: string; codigo: string | null }

export function Header({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)

  const searchRef = useClickOutside(() => setSearchOpen(false))
  const userRef = useClickOutside(() => setUserMenuOpen(false))
  const notifRef = useClickOutside(() => setNotifOpen(false))

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const sb = createClient() as any
    const timer = setTimeout(async () => {
      const { data } = await sb
        .from('tabela_orcamentos')
        .select('id, nome_obra, codigo')
        .ilike('nome_obra', `%${query.trim()}%`)
        .limit(6)
      setResults(data ?? [])
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

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
      {/* Busca rápida de orçamentos */}
      <div ref={searchRef} className="relative w-full max-w-xs">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setSearchOpen(true) }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Buscar orçamento..."
          className="w-full rounded-md border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-sm outline-none transition-colors focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/20"
        />
        {searchOpen && query.trim().length >= 2 && (
          <div className="absolute left-0 top-full z-40 mt-1 w-full rounded-md border border-gray-200 bg-white py-1 shadow-lg">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-400">Nenhum orçamento encontrado.</p>
            ) : (
              results.map(r => (
                <Link
                  key={r.id}
                  href={`/orcamentos/${r.id}` as any}
                  onClick={() => setSearchOpen(false)}
                  className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <span className="truncate">{r.nome_obra}</span>
                  {r.codigo && <span className="ml-2 shrink-0 font-mono text-xs text-gray-400">{r.codigo}</span>}
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Ação rápida */}
      <Link
        href={'/orcamentos/novo' as any}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-800"
      >
        <Plus size={14} /> Novo orçamento
      </Link>

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
