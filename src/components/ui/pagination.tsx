'use client'

import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'

interface PaginationProps {
  total: number
  page: number
  pageSize: number
  /** modo server/URL — omitir 'page' param na página 1 */
  baseHref?: string
  /** modo client/estado — se informado, tem prioridade sobre baseHref */
  onPageChange?: (page: number) => void
}

export function Pagination({ total, page, pageSize, baseHref, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  const pages: (number | '...')[] = []
  if (totalPages <= 9) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 4) pages.push('...')
    for (let i = Math.max(2, page - 2); i <= Math.min(totalPages - 1, page + 2); i++) pages.push(i)
    if (page < totalPages - 3) pages.push('...')
    pages.push(totalPages)
  }

  const from = Math.min((page - 1) * pageSize + 1, total)
  const to = Math.min(page * pageSize, total)
  const sep = baseHref?.includes('?') ? '&' : '?'

  function pageUrl(p: number): Route {
    if (p === 1) return (baseHref || '/') as Route
    return `${baseHref ?? ''}${sep}page=${p}` as Route
  }

  function itemCls(active: boolean, disabled = false) {
    return `min-w-[36px] text-center px-2.5 py-1.5 rounded text-sm border transition-colors ${
      disabled
        ? 'pointer-events-none cursor-default border-gray-200 text-gray-300'
        : active
          ? 'border-primary-700 bg-primary-700 font-medium text-white'
          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
    }`
  }

  function NavItem({ p, disabled, children }: { p: number; disabled: boolean; children: ReactNode }) {
    if (onPageChange) {
      return (
        <button onClick={() => onPageChange(p)} disabled={disabled} className={itemCls(false, disabled)}>
          {children}
        </button>
      )
    }
    return (
      <Link href={pageUrl(p)} aria-disabled={disabled} className={itemCls(false, disabled)}>
        {children}
      </Link>
    )
  }

  return (
    <div className="flex items-center justify-between px-1 py-2">
      <p className="text-sm text-gray-500">
        {from.toLocaleString('pt-BR')}–{to.toLocaleString('pt-BR')} de{' '}
        <span className="font-medium text-gray-700">{total.toLocaleString('pt-BR')}</span>
      </p>
      <div className="flex items-center gap-1">
        <NavItem p={page - 1} disabled={page <= 1}>‹</NavItem>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="select-none px-1.5 py-1.5 text-sm text-gray-400">…</span>
          ) : onPageChange ? (
            <button key={p} onClick={() => onPageChange(p)} className={itemCls(p === page)}>{p}</button>
          ) : (
            <Link key={p} href={pageUrl(p)} className={itemCls(p === page)}>{p}</Link>
          )
        )}

        <NavItem p={page + 1} disabled={page >= totalPages}>›</NavItem>
      </div>
    </div>
  )
}
