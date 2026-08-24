'use client'

import { useState, useRef, useEffect } from 'react'
import { buscarSugestoesCodigo, type SugestaoCodigo } from './planilha-crud-action'
import { formatCurrency } from '@/lib/costs'
import { HighlightMatch } from '@/components/ui/highlight-match'

export function CodigoAutocomplete({
  value, orcamentoId, className, onSelect, onChange,
  onKeyDown: extKeyDown, onBlur: extBlur, autoFocus,
}: {
  value: string
  orcamentoId: string
  className?: string
  onSelect: (s: SugestaoCodigo) => void
  onChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur?: () => void
  autoFocus?: boolean
}) {
  const [sugestoes, setSugestoes] = useState<SugestaoCodigo[]>([])
  const [aberto, setAberto] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const [dropPos, setDropPos] = useState({ left: 0, top: 0, width: 240 })
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cache local: evita re-request para a mesma query. Max 50 entradas (LRU simples).
  const cacheRef = useRef(new Map<string, SugestaoCodigo[]>())
  // ID do request atual: requests obsoletos são descartados silenciosamente.
  const reqIdRef = useRef(0)

  useEffect(() => {
    if (aberto && inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setDropPos({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 320) })
    }
  }, [aberto, sugestoes.length])

  // Busca ao montar — consulta cache antes de ir ao servidor
  useEffect(() => {
    const cached = cacheRef.current.get(value)
    if (cached) { setSugestoes(cached); setAberto(cached.length > 0); return }
    const id = ++reqIdRef.current
    buscarSugestoesCodigo(orcamentoId, value).then(res => {
      if (reqIdRef.current !== id) return
      cacheRef.current.set(value, res)
      setSugestoes(res)
      setAberto(res.length > 0)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleChange(v: string) {
    onChange(v)
    setCursor(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Hit de cache: resposta instantânea, sem debounce
    const cached = cacheRef.current.get(v)
    if (cached) { setSugestoes(cached); setAberto(cached.length > 0); return }

    const reqId = ++reqIdRef.current
    debounceRef.current = setTimeout(async () => {
      const res = await buscarSugestoesCodigo(orcamentoId, v)
      if (reqIdRef.current !== reqId) return // request obsoleto, descartar
      // LRU simples: remove entrada mais antiga quando cache excede 50 entradas
      if (cacheRef.current.size >= 50) cacheRef.current.delete(cacheRef.current.keys().next().value!)
      cacheRef.current.set(v, res)
      setSugestoes(res)
      setAberto(res.length > 0)
    }, 280)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (aberto) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, sugestoes.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); return }
      if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); select(sugestoes[cursor]); return }
      if (e.key === 'Escape')    { setAberto(false); return }
    }
    extKeyDown?.(e)
  }

  function select(s: SugestaoCodigo) {
    onSelect(s)
    setAberto(false)
    setSugestoes([])
    setCursor(-1)
  }

  return (
    <>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { setTimeout(() => setAberto(false), 150); extBlur?.() }}
        autoComplete="off"
        className={className}
      />
      {aberto && (
        <ul
          className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl text-xs max-h-56 overflow-y-auto"
          style={{ left: dropPos.left, top: dropPos.top, width: dropPos.width }}
        >
          {sugestoes.map((s, i) => (
            <li
              key={`${s.fonte}-${s.codigo}-${i}`}
              onMouseDown={() => select(s)}
              className={`px-3 py-2 cursor-pointer flex gap-2 items-center ${i === cursor ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <span className="font-mono font-semibold text-gray-800 whitespace-nowrap shrink-0"><HighlightMatch text={s.codigo} query={value} /></span>
              <span className="text-gray-500 truncate flex-1"><HighlightMatch text={s.descricao} query={value} /></span>
              {s.custo_unitario != null && (
                <span className="shrink-0 tabular-nums text-gray-600">
                  {formatCurrency(s.custo_unitario)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
