'use client'

import { useEffect } from 'react'

/** Fecha um painel (dropdown, popover) ao clicar fora dele — padrão que se
 * repetia solto, reimplementado em cada lugar, em ~8 arquivos do projeto
 * (header.tsx, planilha-switcher.tsx, insumo-autocomplete.tsx etc.).
 * `active` evita registrar o listener quando o painel já está fechado. */
export function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    function handlePointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [ref, onClose, active])
}
