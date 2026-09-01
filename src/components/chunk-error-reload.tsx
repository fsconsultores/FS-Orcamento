'use client'

import { useEffect } from 'react'

// Depois de um novo deploy, uma aba já aberta ainda referencia os hashes de
// chunk do build ANTERIOR — ao navegar (client-side) pra uma rota cujo chunk
// mudou de nome, o browser recebe 400 do arquivo que não existe mais e o
// Next lança ChunkLoadError, travando a navegação sem nenhuma recuperação
// própria. Sessão marcada em sessionStorage evita loop infinito caso o
// reload em si já caia noutro erro de chunk (ex.: build quebrado de verdade).
const FLAG = 'chunk-error-reload-attempted'

export function ChunkErrorReload() {
  useEffect(() => {
    // Chegou até aqui e montou normalmente — o reload (se houve um) já
    // resolveu o problema. Limpa a flag pra um chunk error genuíno de um
    // deploy FUTURO, mais tarde nesta mesma aba, também disparar o reload.
    sessionStorage.removeItem(FLAG)

    function isChunkLoadError(reason: unknown): boolean {
      if (!(reason instanceof Error)) return false
      return reason.name === 'ChunkLoadError' || /Loading chunk [\w-]+ failed/.test(reason.message)
    }

    function handleReload(reason: unknown) {
      if (!isChunkLoadError(reason)) return
      if (sessionStorage.getItem(FLAG)) return
      sessionStorage.setItem(FLAG, '1')
      window.location.reload()
    }

    function onError(e: ErrorEvent) { handleReload(e.error) }
    function onRejection(e: PromiseRejectionEvent) { handleReload(e.reason) }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  return null
}
