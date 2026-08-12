'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function SortableRow({ id, children, className, onContextMenu }: {
  id: string
  children: React.ReactNode
  className?: string
  onContextMenu?: (e: React.MouseEvent) => void
}) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({ id })
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : undefined }}
      className={className}
      onContextMenu={onContextMenu}
    >
      {/* Inject handle cell as first child */}
      <td
        className="px-1 py-0.5 w-6 border border-gray-200 cursor-grab active:cursor-grabbing select-none"
        suppressHydrationWarning
        {...attributes}
        {...listeners}
      >
        <div className="flex justify-center items-center h-full text-gray-300 hover:text-gray-500">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a1 1 0 000 2 1 1 0 000-2zM7 8a1 1 0 000 2 1 1 0 000-2zM7 14a1 1 0 000 2 1 1 0 000-2zM13 2a1 1 0 000 2 1 1 0 000-2zM13 8a1 1 0 000 2 1 1 0 000-2zM13 14a1 1 0 000 2 1 1 0 000-2z" />
          </svg>
        </div>
      </td>
      {children}
    </tr>
  )
}
