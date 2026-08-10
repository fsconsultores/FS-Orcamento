'use client'

import { useEffect, useRef, useState } from 'react'

/** Input de edição inline — foca e seleciona ao montar, commita no blur/Enter, cancela no Escape. */
export function InlineInput({
  value,
  type = 'text',
  align = 'left',
  onCommit,
  onCancel,
}: {
  value: string
  type?: 'text' | 'number' | 'date'
  align?: 'left' | 'right'
  onCommit: (v: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  return (
    <input
      ref={ref}
      type={type}
      value={draft}
      step={type === 'number' ? 'any' : undefined}
      min={type === 'number' ? '0' : undefined}
      onChange={e => setDraft(e.target.value)}
      onBlur={e => onCommit(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(ref.current?.value ?? draft) }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      className={`block w-full rounded border border-blue-400 bg-white px-2 py-0.5 text-sm outline-none ring-2 ring-blue-400/20 ${align === 'right' ? 'text-right' : 'text-left'}`}
    />
  )
}

/** Select de edição inline — mesmo comportamento de foco/commit/cancel do InlineInput. */
export function InlineSelect({
  value,
  options,
  onCommit,
  onCancel,
}: {
  value: string
  options: { value: string; label: string }[]
  onCommit: (v: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLSelectElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <select
      ref={ref}
      defaultValue={value}
      onChange={e => onCommit(e.target.value)}
      onBlur={() => onCancel()}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}
      className="block w-full rounded border border-blue-400 bg-white px-2 py-0.5 text-sm outline-none ring-2 ring-blue-400/20"
    >
      <option value="">—</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
