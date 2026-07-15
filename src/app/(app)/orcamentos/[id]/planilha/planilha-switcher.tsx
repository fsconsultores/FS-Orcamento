'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FileSpreadsheet, ChevronDown, Check, Plus, Settings } from 'lucide-react'
import { criarPlanilhaAction } from './calcular-action'

type Planilha = { id: string; nome: string; bdi_global: number }

export function PlanilhaSwitcher({
  orcamentoId,
  planilhas,
  bdiGlobalOrcamento,
}: {
  orcamentoId: string
  planilhas: Planilha[]
  bdiGlobalOrcamento: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const activePlanilhaId = searchParams.get('planilha') ?? planilhas[0]?.id
  const ativa = planilhas.find(p => p.id === activePlanilhaId) ?? planilhas[0]

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); setCreating(false) }
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function urlComPlanilha(id: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('planilha', id)
    return `${pathname}?${params.toString()}` as any
  }

  function trocar(id: string) {
    setOpen(false)
    if (id === activePlanilhaId) return
    startTransition(() => {
      router.push(urlComPlanilha(id))
      router.refresh()
    })
  }

  async function handleCriar() {
    if (!novoNome.trim() || salvando) return
    setSalvando(true)
    try {
      const nova = await criarPlanilhaAction(orcamentoId, novoNome.trim(), bdiGlobalOrcamento)
      setNovoNome('')
      setCreating(false)
      setOpen(false)
      startTransition(() => {
        router.push(urlComPlanilha(nova.id))
        router.refresh()
      })
    } catch {
      // silencioso — o usuário pode tentar de novo; a lista completa (com erro
      // detalhado) continua disponível em "Gerenciar planilhas"
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 ring-1 ring-primary-200 transition-colors hover:bg-primary-100"
      >
        <FileSpreadsheet size={12} strokeWidth={2} />
        <span className="max-w-[180px] truncate">{ativa?.nome ?? 'Planilha'}</span>
        {planilhas.length > 1 && <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1.5 w-72 rounded-xl border border-gray-200 bg-white py-1.5 shadow-lg">
          <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Planilhas deste orçamento
          </p>
          <div className="max-h-64 overflow-y-auto">
            {planilhas.map(p => {
              const isActive = p.id === activePlanilhaId
              return (
                <button
                  key={p.id}
                  onClick={() => trocar(p.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                    isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {isActive && <Check size={14} strokeWidth={2.5} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
                  {p.bdi_global > 0 && (
                    <span className={`shrink-0 text-xs ${isActive ? 'text-primary-500' : 'text-gray-400'}`}>
                      BDI {p.bdi_global}%
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div className="mt-1 border-t border-gray-100 pt-1">
            {creating ? (
              <form
                onSubmit={e => { e.preventDefault(); handleCriar() }}
                className="flex items-center gap-1.5 px-2 py-1.5"
              >
                <input
                  autoFocus
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setCreating(false) } }}
                  placeholder="Nome da nova planilha"
                  className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
                <button
                  type="submit"
                  disabled={!novoNome.trim() || salvando}
                  className="shrink-0 rounded-md bg-primary-700 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
                >
                  {salvando ? '…' : 'Criar'}
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-primary-700 transition-colors hover:bg-gray-50"
              >
                <Plus size={14} /> Nova planilha
              </button>
            )}
            <Link
              href={`/orcamentos/${orcamentoId}` as any}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-xs text-gray-400 transition-colors hover:text-gray-600"
            >
              <Settings size={12} /> Gerenciar planilhas (renomear, duplicar, excluir)
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
