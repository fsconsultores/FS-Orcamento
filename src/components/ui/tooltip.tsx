'use client'

import { useId, useState, type ReactNode } from 'react'

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false)
  const id = useId()

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      <span aria-describedby={show ? id : undefined}>{children}</span>
      {show && (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-lg"
        >
          {label}
        </span>
      )}
    </span>
  )
}
