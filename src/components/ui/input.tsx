import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface FieldWrapperProps {
  label?: string
  help?: string
  error?: string
  required?: boolean
}

const FIELD_CLS = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:bg-gray-50 disabled:text-gray-400'
const ERROR_CLS = 'border-red-300 focus:border-red-500 focus:ring-red-500/20'

function FieldShell({ label, help, error, required, children }: FieldWrapperProps & { children: ReactNode }) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="text-xs font-medium text-gray-600">
          {label}{required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : help ? <p className="text-xs text-gray-400">{help}</p> : null}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldWrapperProps>(
  function Input({ label, help, error, required, className = '', ...rest }, ref) {
    return (
      <FieldShell label={label} help={help} error={error} required={required}>
        <input ref={ref} className={`${FIELD_CLS} ${error ? ERROR_CLS : ''} ${className}`} {...rest} />
      </FieldShell>
    )
  }
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldWrapperProps>(
  function Textarea({ label, help, error, required, className = '', ...rest }, ref) {
    return (
      <FieldShell label={label} help={help} error={error} required={required}>
        <textarea ref={ref} className={`${FIELD_CLS} ${error ? ERROR_CLS : ''} ${className}`} {...rest} />
      </FieldShell>
    )
  }
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldWrapperProps>(
  function Select({ label, help, error, required, className = '', children, ...rest }, ref) {
    return (
      <FieldShell label={label} help={help} error={error} required={required}>
        <select ref={ref} className={`${FIELD_CLS} ${error ? ERROR_CLS : ''} ${className}`} {...rest}>
          {children}
        </select>
      </FieldShell>
    )
  }
)
