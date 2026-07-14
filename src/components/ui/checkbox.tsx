import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Checkbox({ className = '', onClick, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        onClick={e => e.stopPropagation()}
        className={`h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-primary-700 focus:ring-2 focus:ring-primary-500/30 ${className}`}
        {...rest}
      />
    )
  }
)
