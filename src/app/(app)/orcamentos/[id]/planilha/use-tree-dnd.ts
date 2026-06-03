'use client'

import { useState, useRef } from 'react'
import type { DragEndEvent, DragMoveEvent, DragStartEvent } from '@dnd-kit/core'

export interface FlatItem {
  id: string
  parent_id: string | null
  ordem: number
  nivel: number
}

export interface DragProjection {
  parentId: string | null
  depth: number
  overId: string | null
}

const INDENT_PER_LEVEL = 20 // px por nível de indentação

export function useTreeDnd(items: FlatItem[]) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [offsetLeft, setOffsetLeft] = useState(0)
  const dragDeltaX = useRef(0)

  const activeItem = activeId ? items.find(i => i.id === activeId) ?? null : null

  // Calcula o depth projetado durante o drag com base no deslocamento horizontal
  function getProjectedDepth(currentDepth: number): number {
    const delta = Math.round(dragDeltaX.current / INDENT_PER_LEVEL)
    const projected = currentDepth + delta
    // Mínimo: 0 (root). Máximo: profundidade do item acima + 1
    return Math.max(0, projected)
  }

  function getProjection(overItemId: string | null): DragProjection | null {
    if (!activeId || !overItemId || activeId === overItemId) return null

    const flatVisible = items // assume já está em ordem flat
    const overIndex = flatVisible.findIndex(i => i.id === overItemId)
    const activeItem = flatVisible.find(i => i.id === activeId)
    if (overIndex === -1 || !activeItem) return null

    const overItem = flatVisible[overIndex]
    const currentDepth = activeItem.nivel - 1 // nivel começa em 1
    const projectedDepth = getProjectedDepth(currentDepth)

    // Impede mover um item para dentro de si mesmo ou descendentes
    const isDescendant = isChildOf(activeId, overItemId, items)
    if (isDescendant) return null

    // Encontra o parentId com base no depth projetado
    // Olha os itens acima do `over` para achar um ancestral compatível
    let newParentId: string | null = null
    if (projectedDepth === 0) {
      newParentId = null
    } else {
      // Sobe na lista para encontrar um item no depth correto
      for (let i = overIndex - 1; i >= 0; i--) {
        const candidate = flatVisible[i]
        if (candidate.id === activeId) continue
        if (candidate.nivel - 1 === projectedDepth - 1) {
          newParentId = candidate.id
          break
        }
        if (candidate.nivel - 1 < projectedDepth - 1) {
          newParentId = candidate.id
          break
        }
      }
    }

    return { parentId: newParentId, depth: projectedDepth, overId: overItemId }
  }

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id))
    setOverId(null)
    dragDeltaX.current = 0
  }

  function onDragMove({ delta }: DragMoveEvent) {
    dragDeltaX.current = delta.x
    setOffsetLeft(delta.x)
  }

  function onDragOver({ over }: { over: { id: string | number } | null }) {
    setOverId(over ? String(over.id) : null)
  }

  function onDragCancel() {
    setActiveId(null)
    setOverId(null)
    dragDeltaX.current = 0
  }

  const projection = getProjection(overId)

  return {
    activeId,
    activeItem,
    overId,
    offsetLeft,
    projection,
    onDragStart,
    onDragMove,
    onDragOver,
    onDragCancel,
  }
}

function isChildOf(parentId: string, candidateId: string, items: FlatItem[]): boolean {
  let current: string | null = candidateId
  while (current) {
    const item = items.find(i => i.id === current)
    if (!item) return false
    if (item.parent_id === parentId) return true
    current = item.parent_id
  }
  return false
}
