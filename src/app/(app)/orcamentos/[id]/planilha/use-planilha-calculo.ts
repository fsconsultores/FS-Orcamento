'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import { buscarItensEstrutura, type EstruturaItem } from './planilha-crud-action'
import {
  calcularPlanilhaAtualAction, recalcularProjetoAction, verificarConsistenciaAction,
  detectarOrfaosAction, confirmarLimpezaAction,
} from './calcular-action'
import type { CalculoResult, ConsistenciaReport, TotaisPlanilha } from '@/lib/orcamento/motor-calculo'
import type { OrfaosDetectados } from '@/lib/orcamento/types'
import { useToast } from '@/components/ui/toast'

export function usePlanilhaCalculo({
  orcamentoId,
  activePlanilhaId,
  setItems,
  structuralChangeSeqRef,
  onRecalculated,
}: {
  orcamentoId: string
  activePlanilhaId: string | null
  setItems: (items: EstruturaItem[]) => void
  /** Do usePlanilhaSave — deixa onRecalculated (resetBaseline) saber se uma
   * mudança estrutural mais nova aconteceu enquanto este cálculo buscava os
   * itens frescos, pra não apagar o sinal de que ela ainda não foi salva
   * (mesma race do achado 🔴 do F7, ver usePlanilhaSave). */
  structuralChangeSeqRef: RefObject<number>
  /** Chamado com os itens recém-buscados depois de um cálculo bem-sucedido —
   * "Calcular" também persiste no servidor, então isso conta como um novo
   * ponto confirmado, igual a um "Salvar Planilha" (ver usePlanilhaSave). */
  onRecalculated: (freshItems: EstruturaItem[], expectedSeq?: number) => void
}) {
  const toast = useToast()
  const [calcMode, setCalcMode] = useState<'planilha' | 'projeto' | null>(null)
  const [calcPanelOpen, setCalcPanelOpen] = useState(false)
  const calcPanelRef = useRef<HTMLDivElement>(null)
  const [calcLogs, setCalcLogs] = useState<string[]>([])
  const [calcErro, setCalcErro] = useState<string | null>(null)
  const [calcResultado, setCalcResultado] = useState<{ itens: number; comps: number } | null>(null)
  const [orfaosDetectados, setOrfaosDetectados] = useState<OrfaosDetectados | null>(null)
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false)
  const [limpandoOrfaos, setLimpandoOrfaos] = useState(false)
  const [consistenciaReport, setConsistenciaReport] = useState<ConsistenciaReport | null>(null)
  const [verificando, setVerificando] = useState(false)
  const [totaisProjetoResult, setTotaisProjetoResult] = useState<TotaisPlanilha[] | null>(null)
  const [tipoValorFinal, setTipoValorFinal] = useState<'custo' | 'venda'>('custo')
  const [valorFinalInput, setValorFinalInput] = useState('')

  // Auto-dismiss do toast de resultado do cálculo — evita que fique preso na tela
  useEffect(() => {
    if (!calcResultado) return
    const t = setTimeout(() => setCalcResultado(null), 6000)
    return () => clearTimeout(t)
  }, [calcResultado])

  async function handleCalcular(modo: 'planilha' | 'projeto') {
    if (calcMode) return
    if (modo === 'planilha' && !activePlanilhaId) return
    setCalcMode(modo)
    setCalcLogs([])
    setCalcErro(null)
    setCalcResultado(null)
    if (modo === 'projeto') setTotaisProjetoResult(null)
    setCalcPanelOpen(false)
    try {
      const result: CalculoResult = modo === 'planilha'
        ? await calcularPlanilhaAtualAction(orcamentoId, activePlanilhaId!)
        : await recalcularProjetoAction(orcamentoId)
      setCalcLogs(result.logs.map(l => l.msg))
      if (!result.ok) {
        setCalcErro(result.erro ?? 'Erro desconhecido.')
      } else {
        setCalcResultado({ itens: result.itensAtualizados, comps: result.composicoesRecalculadas })
      }
      if (modo === 'projeto' && result.totaisPlanilhas) setTotaisProjetoResult(result.totaisPlanilhas)
      const seqAtStart = structuralChangeSeqRef.current
      const fresh = await buscarItensEstrutura(orcamentoId, activePlanilhaId)
      setItems(fresh)
      onRecalculated(fresh, seqAtStart)
    } finally {
      setCalcMode(null)
    }
  }

  async function handleVerificarConsistencia() {
    setVerificando(true)
    setCalcPanelOpen(false)
    try {
      const report = await verificarConsistenciaAction(orcamentoId)
      setConsistenciaReport(report)
    } finally {
      setVerificando(false)
    }
  }

  async function handleLimparProjeto() {
    setCalcPanelOpen(false)
    const orfaos = await detectarOrfaosAction(orcamentoId)
    if (orfaos.composicoes.length === 0) {
      toast.show('Nenhuma composição órfã encontrada. O projeto está limpo.', 'info')
      return
    }
    setOrfaosDetectados(orfaos)
    setConfirmarLimpeza(true)
  }

  async function handleLimparOrfaos() {
    if (!orfaosDetectados || limpandoOrfaos) return
    setLimpandoOrfaos(true)
    try {
      const ids = orfaosDetectados.composicoes.map(c => c.id)
      await confirmarLimpezaAction(orcamentoId, ids)
      setConfirmarLimpeza(false)
      setOrfaosDetectados(null)
    } finally {
      setLimpandoOrfaos(false)
    }
  }

  useEffect(() => {
    if (!calcPanelOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (calcPanelRef.current && !calcPanelRef.current.contains(e.target as Node)) {
        setCalcPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [calcPanelOpen])

  // Atalho de teclado: F9 calcula a planilha ativa
  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      if (e.repeat) return
      if (e.key === 'F9') {
        e.preventDefault()
        if (calcMode === null) handleCalcular('planilha')
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcMode, activePlanilhaId])

  return {
    calcMode, calcPanelOpen, setCalcPanelOpen, calcPanelRef,
    calcLogs, calcErro, calcResultado, setCalcResultado,
    orfaosDetectados, setOrfaosDetectados, confirmarLimpeza, setConfirmarLimpeza, limpandoOrfaos,
    consistenciaReport, setConsistenciaReport, verificando,
    totaisProjetoResult, setTotaisProjetoResult,
    tipoValorFinal, setTipoValorFinal, valorFinalInput, setValorFinalInput,
    handleCalcular, handleVerificarConsistencia, handleLimparProjeto, handleLimparOrfaos,
  }
}
