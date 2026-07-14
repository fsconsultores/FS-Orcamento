'use client'

import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Spinner } from './spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

const VARIANT_CLS: Record<ButtonVariant, string> = {
  primary: 'bg-primary-700 text-white hover:bg-primary-800',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
  ghost: 'text-gray-600 hover:bg-gray-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

const SIZE_CLS: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading, icon, disabled, className = '', children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLS[variant]} ${SIZE_CLS[size]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 13 : 15} /> : icon}
      {children}
    </button>
  )
})

export function IconButton({
  icon, label, size = 'md', variant = 'ghost', className = '', ...rest
}: Omit<Props, 'children' | 'icon'> & { icon: ReactNode; label: string }) {
  const dim = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${dim} ${VARIANT_CLS[variant]} ${className}`}
      {...rest}
    >
      {icon}
    </button>
  )
}
