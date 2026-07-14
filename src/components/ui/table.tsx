import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes } from 'react'

export function Table({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-xl border border-gray-200 bg-white ${className}`}>
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

export function Thead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-gray-200 bg-gray-50">
      <tr>{children}</tr>
    </thead>
  )
}

export function Th({ children, className = '', ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 ${className}`} {...rest}>
      {children}
    </th>
  )
}

export function Tbody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>
}

export function Tr({ children, className = '', ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`border-b border-gray-100 transition-colors last:border-0 hover:bg-gray-50 ${className}`} {...rest}>
      {children}
    </tr>
  )
}

export function Td({ children, className = '', ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 text-gray-700 ${className}`} {...rest}>
      {children}
    </td>
  )
}
