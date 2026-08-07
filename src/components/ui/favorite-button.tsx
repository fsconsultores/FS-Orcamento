'use client'

import { useState, useTransition } from 'react'
import { Star } from 'lucide-react'
import { toggleFavorito, type EntityType } from '@/lib/favoritos'
import { useToast } from './toast'

export function FavoriteButton({
  entityType,
  entityId,
  initialFavorito,
  size = 15,
  className = '',
}: {
  entityType: EntityType
  entityId: string
  initialFavorito: boolean
  size?: number
  className?: string
}) {
  const [favorito, setFavorito] = useState(initialFavorito)
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (isPending) return // evita duplo-clique disparar duas chamadas sobrepostas
    const next = !favorito
    setFavorito(next)
    startTransition(async () => {
      const result = await toggleFavorito(entityType, entityId, next)
      if ('error' in result) {
        setFavorito(!next)
        toast.show('Não foi possível atualizar o favorito. Tente novamente.', 'error')
      }
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      aria-label={favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      title={favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-300 transition-colors hover:bg-amber-50 hover:text-amber-400 disabled:cursor-wait ${favorito ? '!text-amber-400' : ''} ${className}`}
    >
      <Star size={size} fill={favorito ? 'currentColor' : 'none'} />
    </button>
  )
}
