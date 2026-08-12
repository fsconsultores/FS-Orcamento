'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { atualizarItemEstrutura, restaurarEstruturaSnapshot, buscarItensEstrutura, type EstruturaItem } from './planilha-crud-action'
import { validarComposicoes } from './planilha-import-action'

export function usePlanilhaSave({
  orcamentoId,
  activePlanilhaId,
  items,
  flushPendingEdit,
}: {
  orcamentoId: string
  activePlanilhaId: string | null
  items: EstruturaItem[]
  flushPendingEdit?: () => void
}) {
  const router = useRouter()
  const [isDirty, setIsDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [invalidCodigos, setInvalidCodigos] = useState<Set<string>>(new Set())
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [showInvalidModal, setShowInvalidModal] = useState(false)
  const pendingHrefRef = useRef<string | null>(null)
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyItemsRef = useRef<Map<string, Partial<EstruturaItem>>>(new Map())
  // "Estado confirmado" da planilha ativa — usado para desfazer operações
  // estruturais (adicionar/excluir/mover) se o usuário sair sem salvar. Essas
  // operações persistem no banco na hora do clique (diferente das edições de
  // célula, que só vão ao banco no "Salvar Planilha"), então precisam de um
  // snapshot próprio para serem revertidas. Ver handleConfirmLeave.
  const baselineRef = useRef<EstruturaItem[]>(items.map(it => ({ ...it })))
  const structuralDirtyRef = useRef(false)
  // Incrementado a cada mudança estrutural (ver markStructuralChange) — usado
  // por resetBaseline pra saber se uma mudança mais nova aconteceu ENQUANTO
  // um fetch de confirmação (handleSave/handleCalcular buscando os itens
  // frescos do servidor) ainda estava em voo. Sem isso, um resetBaseline que
  // termina depois de um novo insert/excluir/mover apagaria o sinal de que
  // essa mudança mais nova ainda não foi salva (achado 🔴 da Fase C).
  const structuralChangeSeqRef = useRef(0)
  const isSaving = saveStatus === 'saving'

  function scheduleSaved() {
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current)
    setSaveStatus('saved')
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
  }

  function markStructuralChange() {
    structuralDirtyRef.current = true
    structuralChangeSeqRef.current++
  }

  // `expectedSeq`: se informado, só reseta a flag de dirty estrutural quando
  // nenhuma mudança estrutural mais nova aconteceu desde que o chamador
  // capturou `structuralChangeSeqRef.current` (antes do próprio fetch
  // assíncrono). O baseline em si é sempre atualizado — reflete o que já
  // está confirmado no banco até aqui.
  function resetBaseline(freshItems: EstruturaItem[], expectedSeq?: number) {
    baselineRef.current = freshItems.map(it => ({ ...it }))
    if (expectedSeq === undefined || structuralChangeSeqRef.current === expectedSeq) {
      structuralDirtyRef.current = false
    }
  }

  // Avisa o browser ao fechar aba / recarregar com alterações pendentes
  useEffect(() => {
    if (!isDirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [isDirty])

  // Intercepta cliques em links internos quando há alterações pendentes
  useEffect(() => {
    if (!isDirty) return
    function handle(e: MouseEvent) {
      const a = (e.target as HTMLElement).closest('a')
      if (!a) return
      const href = a.getAttribute('href')
      if (!href || href.startsWith('#') || href === window.location.pathname) return
      e.preventDefault()
      e.stopPropagation()
      pendingHrefRef.current = href
      setShowLeaveModal(true)
    }
    document.addEventListener('click', handle, true)
    return () => document.removeEventListener('click', handle, true)
  }, [isDirty])

  async function handleSave() {
    flushPendingEdit?.()
    setSaveStatus('saving')
    try {
      // 1. Validar composições antes de persistir
      const codigos = [...new Set(
        items.filter(i => i.tipo === 'item' && i.codigo).map(i => i.codigo!)
      )]
      if (codigos.length > 0) {
        const invalidos = await validarComposicoes(orcamentoId, codigos)
        if (invalidos.length > 0) {
          setInvalidCodigos(new Set(invalidos))
          setShowInvalidModal(true)
          setSaveStatus('error')
          return
        }
      }
      // 2. Persistir todos os campos acumulados desde o último save
      const pending = [...dirtyItemsRef.current.entries()]
      if (pending.length > 0) {
        await Promise.all(
          pending.map(([id, fields]) => atualizarItemEstrutura(id, orcamentoId, fields as any))
        )
        dirtyItemsRef.current.clear()
      }
      setInvalidCodigos(new Set())
      setIsDirty(false)
      // Tudo até aqui (edições de célula + qualquer add/excluir/mover feito
      // nesta sessão) agora está confirmado no banco — vira o novo baseline.
      // Busca do servidor em vez de usar o `items` local: a prop
      // `initialItems` (revalidada após qualquer Server Action estrutural)
      // pode demorar a chegar e sobrescrever `items` de volta pra um estado
      // mais antigo entre a criação de um item e o F7 — gravando um
      // baseline sem esse item, que "Sair sem salvar" depois apagaria por
      // engano mesmo já estando salvo. Mesma race que `handleCalcular` já
      // evita buscando fresco antes de confirmar o baseline (achado 🔴 da
      // Fase C).
      const seqAtStart = structuralChangeSeqRef.current
      const fresh = await buscarItensEstrutura(orcamentoId, activePlanilhaId)
      resetBaseline(fresh, seqAtStart)
      scheduleSaved()
    } catch {
      setSaveStatus('error')
    }
  }

  async function handleConfirmLeave() {
    setShowLeaveModal(false)
    console.log('[DEBUG sair-sem-salvar]', {
      structuralDirty: structuralDirtyRef.current,
      baselineCount: baselineRef.current.length,
      currentCount: items.length,
      activePlanilhaId,
      baselineIds: baselineRef.current.map(it => it.id),
      currentIds: items.map(it => it.id),
    })
    if (structuralDirtyRef.current) {
      try {
        await restaurarEstruturaSnapshot(orcamentoId, activePlanilhaId, baselineRef.current)
        console.log('[DEBUG sair-sem-salvar] restaurarEstruturaSnapshot OK')
      } catch (e) {
        // Best-effort: não trava a navegação por causa disso — pior caso é
        // igual ao bug original (item adicionado/excluído/movido permanece).
        console.error('[Planilha] Falha ao descartar alterações estruturais:', e)
      }
      structuralDirtyRef.current = false
    }
    dirtyItemsRef.current.clear()
    setIsDirty(false)
    const href = pendingHrefRef.current
    pendingHrefRef.current = null
    if (href) router.push(href as any)
  }

  // Atalho de teclado: F7 salva as alterações
  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      if (e.repeat) return
      if (e.key === 'F7') {
        e.preventDefault()
        if (!isSaving && invalidCodigos.size === 0) handleSave()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSaving, invalidCodigos])

  return {
    isDirty, setIsDirty, saveStatus, isSaving,
    invalidCodigos, setInvalidCodigos,
    showLeaveModal, setShowLeaveModal, showInvalidModal, setShowInvalidModal,
    dirtyItemsRef, baselineRef, structuralDirtyRef, structuralChangeSeqRef,
    handleSave, handleConfirmLeave, resetBaseline, markStructuralChange,
  }
}
