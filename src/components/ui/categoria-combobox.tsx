'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { normalizeText } from '@/lib/text-normalize'
import { HighlightMatch } from './highlight-match'
import { FieldShell, FIELD_CLS } from './input'
import type { CategoriaResumo } from '@/lib/orcamento/categorias-insumo'

/**
 * Campo "Categoria" — pesquisar entre as já usadas (em qualquer obra),
 * selecionar uma, ou digitar uma nova quando não existir ainda. Nunca há
 * "cadastro" de categoria de verdade: aceitar um valor novo aqui só grava o
 * texto digitado em orcamento_insumos.categoria, igual qualquer outro campo
 * — ver análise "Categorias de Insumos" (31/08/2026) sobre por que isso é
 * texto livre com combobox, não uma tabela com CRUD próprio.
 *
 * `compact`: sem label/moldura de campo, pra caber numa célula de tabela
 * (edição inline de um insumo já existente) em vez do formulário de criação.
 */
export function CategoriaCombobox({
  value,
  onChange,
  categorias,
  label,
  help,
  placeholder = 'Ex.: Abajur',
  compact = false,
  autoFocus = false,
  onBlurCommit,
}: {
  value: string
  onChange: (v: string) => void
  categorias: CategoriaResumo[]
  label?: string
  help?: string
  placeholder?: string
  compact?: boolean
  autoFocus?: boolean
  /** Chamado ao fechar (blur, Enter, Escape) — usado pela edição inline da tabela, que só persiste no banco ao sair do campo. */
  onBlurCommit?: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [open, setOpen] = useState(false)
  const [ativo, setAtivo] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (!open) return
    function onClickFora(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) fechar()
    }
    document.addEventListener('mousedown', onClickFora)
    return () => document.removeEventListener('mousedown', onClickFora)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const draftChaveNorm = normalizeText(draft)
  const opcoes = useMemo(() => {
    if (!draftChaveNorm) return categorias.slice(0, 8)
    return categorias.filter(c => normalizeText(c.categoria).includes(draftChaveNorm)).slice(0, 8)
  }, [categorias, draftChaveNorm])

  const existeExata = draft.trim() !== '' && categorias.some(c => normalizeText(c.categoria) === draftChaveNorm)
  const mostrarCriarNova = draft.trim() !== '' && !existeExata
  const totalItens = opcoes.length + (mostrarCriarNova ? 1 : 0)

  function escolher(v: string) {
    const escolhida = v.trim()
    setDraft(escolhida)
    onChange(escolhida)
    onBlurCommit?.(escolhida)
    fechar()
  }

  function fechar() {
    setOpen(false)
    setAtivo(0)
  }

  function commitAtual() {
    const v = draft.trim()
    onChange(v)
    onBlurCommit?.(v)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setAtivo(a => Math.min(a + 1, totalItens - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAtivo(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && totalItens > 0) {
        if (ativo < opcoes.length) escolher(opcoes[ativo].categoria)
        else escolher(draft)
      } else {
        commitAtual()
        fechar()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(value)
      fechar()
      inputRef.current?.blur()
    }
  }

  const inputEl = (
    <div ref={wrapRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={e => { setDraft(e.target.value); setOpen(true); setAtivo(0) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { commitAtual(); fechar() }}
        onKeyDown={onKeyDown}
        className={compact
          ? 'block w-full rounded border border-blue-400 bg-white px-2 py-0.5 text-sm outline-none ring-2 ring-blue-400/20'
          : FIELD_CLS}
      />
      {open && totalItens > 0 && (
        <ul
          className="absolute z-20 mt-1 max-h-56 w-full min-w-[200px] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
          // evita que o mousedown na lista dispare o onBlur do input antes do onClick da opção
          onMouseDown={e => e.preventDefault()}
        >
          {opcoes.map((c, i) => (
            <li key={c.categoria}>
              <button
                type="button"
                onClick={() => escolher(c.categoria)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left ${i === ativo ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                <span className="truncate"><HighlightMatch text={c.categoria} query={draft} /></span>
                <span className="shrink-0 text-xs text-gray-400">{c.usos} {c.usos === 1 ? 'insumo' : 'insumos'}</span>
              </button>
            </li>
          ))}
          {mostrarCriarNova && (
            <li>
              <button
                type="button"
                onClick={() => escolher(draft)}
                className={`flex w-full items-center gap-1.5 px-3 py-1.5 text-left ${opcoes.length === ativo ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                <Plus size={13} className="shrink-0" />
                <span className="truncate">Usar "{draft.trim()}" (categoria nova)</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )

  if (compact) return inputEl
  return <FieldShell id={`categoria-${label ?? 'combobox'}`} label={label} help={help}>{inputEl}</FieldShell>
}
