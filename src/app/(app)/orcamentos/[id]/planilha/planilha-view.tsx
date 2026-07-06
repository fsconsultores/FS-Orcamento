'use client'

import { useState, useRef, useEffect, Fragment, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { atualizarItemEstrutura, deletarItemEstrutura, adicionarItemEstrutura, adicionarItemNaPosicao, limparPlanilha, buscarSugestoesCodigo, salvarNumeros, moverItem, buscarItensEstrutura, validarComposicoes } from './planilha-action'
import type { SugestaoCodigo, EstruturaItem } from './planilha-action'
import { calcularPlanilhaAtualAction, recalcularProjetoAction, verificarConsistenciaAction, detectarOrfaosAction, confirmarLimpezaAction } from './calcular-action'
import { atualizarPrecoInsumoAction } from '../atualizar-preco-insumo-action'
import type { CalculoResult, ConsistenciaReport, TotaisPlanilha } from '@/lib/orcamento/motor-calculo'
import type { OrfaosDetectados } from '@/lib/orcamento/types'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, type DragEndEvent, type DragStartEvent, type DragMoveEvent,
} from '@dnd-kit/core'
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export type { EstruturaItem }

// ─── DnD helpers ─────────────────────────────────────────────────────────────

function SortableRow({ id, children, className, onContextMenu }: {
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

interface Nodo extends EstruturaItem {
  filhos: Nodo[]
  total: number
  totalComBdi: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildTree(items: EstruturaItem[]): Nodo[] {
  const map = new Map<string, Nodo>()
  for (const item of items) map.set(item.id, { ...item, filhos: [], total: 0, totalComBdi: 0 })
  const roots: Nodo[] = []
  for (const nodo of map.values()) {
    if (nodo.parent_id && map.has(nodo.parent_id)) map.get(nodo.parent_id)!.filhos.push(nodo)
    else roots.push(nodo)
  }
  function sort(nodes: Nodo[]) {
    nodes.sort((a, b) => a.ordem - b.ordem)
    for (const n of nodes) sort(n.filhos)
  }
  sort(roots)
  return roots
}

function calcTotais(nodo: Nodo, bdiGlobal: number): number {
  if (nodo.filhos.length === 0) {
    nodo.total = (nodo.quantidade ?? 0) * (nodo.custo_unitario ?? 0)
    const bdi = nodo.bdi_especifico ?? bdiGlobal
    nodo.totalComBdi = nodo.total * (1 + bdi / 100)
  } else {
    nodo.filhos.forEach(f => calcTotais(f, bdiGlobal))
    nodo.total = nodo.filhos.reduce((s, f) => s + f.total, 0)
    nodo.totalComBdi = nodo.filhos.reduce((s, f) => s + f.totalComBdi, 0)
  }
  return nodo.total
}

function atribuirNumeros(nodes: Nodo[], digitos: number[], prefix = '', nivel = 1) {
  nodes.sort((a, b) => a.ordem - b.ordem)
  const width = digitos[nivel - 1] ?? digitos[digitos.length - 1] ?? 1
  nodes.forEach((node, i) => {
    const seq = String(i + 1).padStart(width, '0')
    node.numero = prefix ? `${prefix}.${seq}` : seq
    atribuirNumeros(node.filhos, digitos, node.numero, nivel + 1)
  })
}

function coletarNumeros(nodes: Nodo[], nivel = 1): { id: string; numero: string; nivel: number }[] {
  return nodes.flatMap(n => [
    { id: n.id, numero: n.numero, nivel },
    ...coletarNumeros(n.filhos, nivel + 1),
  ])
}

function flattenTree(nodos: Nodo[], depth = 0): { nodo: Nodo; depth: number }[] {
  return nodos.flatMap(n => [{ nodo: n, depth }, ...flattenTree(n.filhos, depth + 1)])
}

const BRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function rowCls(depth: number, hasChildren: boolean, rowIdx: number) {
  const base = rowIdx % 2 === 0 ? 'bg-white' : 'bg-[#eef2f6]'
  const weight = hasChildren ? 'font-bold' : 'font-normal'
  return `${base} text-gray-900 ${weight} hover:bg-blue-100`
}

// ─── Autocomplete de Código ───────────────────────────────────────────────────

function CodigoAutocomplete({
  value, orcamentoId, className, onSelect, onChange,
  onKeyDown: extKeyDown, onBlur: extBlur, autoFocus,
}: {
  value: string
  orcamentoId: string
  className?: string
  onSelect: (s: SugestaoCodigo) => void
  onChange: (v: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur?: () => void
  autoFocus?: boolean
}) {
  const [sugestoes, setSugestoes] = useState<SugestaoCodigo[]>([])
  const [aberto, setAberto] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const [dropPos, setDropPos] = useState({ left: 0, top: 0, width: 240 })
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Cache local: evita re-request para a mesma query. Max 50 entradas (LRU simples).
  const cacheRef = useRef(new Map<string, SugestaoCodigo[]>())
  // ID do request atual: requests obsoletos são descartados silenciosamente.
  const reqIdRef = useRef(0)

  useEffect(() => {
    if (aberto && inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setDropPos({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 320) })
    }
  }, [aberto, sugestoes.length])

  // Busca ao montar — consulta cache antes de ir ao servidor
  useEffect(() => {
    const cached = cacheRef.current.get(value)
    if (cached) { setSugestoes(cached); setAberto(cached.length > 0); return }
    const id = ++reqIdRef.current
    buscarSugestoesCodigo(orcamentoId, value).then(res => {
      if (reqIdRef.current !== id) return
      cacheRef.current.set(value, res)
      setSugestoes(res)
      setAberto(res.length > 0)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleChange(v: string) {
    onChange(v)
    setCursor(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Hit de cache: resposta instantânea, sem debounce
    const cached = cacheRef.current.get(v)
    if (cached) { setSugestoes(cached); setAberto(cached.length > 0); return }

    const reqId = ++reqIdRef.current
    debounceRef.current = setTimeout(async () => {
      const res = await buscarSugestoesCodigo(orcamentoId, v)
      if (reqIdRef.current !== reqId) return // request obsoleto, descartar
      // LRU simples: remove entrada mais antiga quando cache excede 50 entradas
      if (cacheRef.current.size >= 50) cacheRef.current.delete(cacheRef.current.keys().next().value!)
      cacheRef.current.set(v, res)
      setSugestoes(res)
      setAberto(res.length > 0)
    }, 280)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (aberto) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, sugestoes.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); return }
      if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); select(sugestoes[cursor]); return }
      if (e.key === 'Escape')    { setAberto(false); return }
    }
    extKeyDown?.(e)
  }

  function select(s: SugestaoCodigo) {
    onSelect(s)
    setAberto(false)
    setSugestoes([])
    setCursor(-1)
  }

  return (
    <>
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { setTimeout(() => setAberto(false), 150); extBlur?.() }}
        autoComplete="off"
        className={className}
      />
      {aberto && (
        <ul
          className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl text-xs max-h-56 overflow-y-auto"
          style={{ left: dropPos.left, top: dropPos.top, width: dropPos.width }}
        >
          {sugestoes.map((s, i) => (
            <li
              key={`${s.fonte}-${s.codigo}-${i}`}
              onMouseDown={() => select(s)}
              className={`px-3 py-2 cursor-pointer flex gap-2 items-center ${i === cursor ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <span className="font-mono font-semibold text-gray-800 whitespace-nowrap shrink-0">{s.codigo}</span>
              <span className="text-gray-500 truncate flex-1">{s.descricao}</span>
              {s.custo_unitario != null && (
                <span className="shrink-0 tabular-nums text-gray-600">
                  {s.custo_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ─── Formulário de novo item ──────────────────────────────────────────────────

function AddItemForm({
  orcamentoId, parentId, parentNivel, parentNumero, parentDescricao, onClose, isGroup, planilhaId,
}: {
  orcamentoId: string
  parentId: string | null
  parentNivel: number
  parentNumero: string
  parentDescricao?: string
  onClose: (newItem?: EstruturaItem) => void
  isGroup?: boolean
  planilhaId?: string | null
}) {
  const [form, setForm] = useState({ codigo: '', descricao: '', unidade: '', quantidade: '', custo_unitario: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const newItem = await adicionarItemEstrutura(orcamentoId, parentId, parentNivel, {
        numero: '',
        codigo: isGroup ? null : (form.codigo || null),
        descricao: form.descricao,
        unidade: isGroup ? null : (form.unidade || null),
        quantidade: isGroup ? null : (parseFloat(form.quantidade.replace(',', '.')) || null),
        custo_unitario: isGroup ? null : (parseFloat(form.custo_unitario.replace(',', '.')) || null),
        tipo: isGroup ? 'grupo' : 'item',
      }, planilhaId)
      onClose(newItem)
    } finally { setLoading(false) }
  }

  const inp = 'w-full rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400'
  return (
    <form onSubmit={handleSubmit} className="bg-blue-50 border border-blue-200 rounded-lg text-xs overflow-hidden">
      {parentDescricao && (
        <div className="px-3 py-1.5 bg-blue-600 text-white text-[11px] font-medium flex items-center gap-2">
          <span className="opacity-70">Adicionando em:</span>
          <span className="font-mono">{parentNumero}</span>
          <span className="truncate">{parentDescricao}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-end p-2">
        {!isGroup && (
          <div className="relative">
            <label className="block text-gray-500 mb-0.5">Código</label>
            <CodigoAutocomplete
              value={form.codigo} orcamentoId={orcamentoId} className={`${inp} w-24`}
              onChange={v => setForm(p => ({ ...p, codigo: v }))}
              onSelect={s => setForm(p => ({ ...p, codigo: s.codigo, descricao: s.descricao, unidade: s.unidade, custo_unitario: s.custo_unitario != null ? String(s.custo_unitario) : p.custo_unitario }))}
            />
          </div>
        )}
        <div className="flex-1 min-w-48">
          <label className="block text-gray-500 mb-0.5">Descrição *</label>
          <input autoFocus required value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} className={inp} />
        </div>
        {!isGroup && (
          <>
            <div>
              <label className="block text-gray-500 mb-0.5">Und</label>
              <input value={form.unidade} onChange={e => setForm(p => ({ ...p, unidade: e.target.value }))} className={`${inp} w-16`} />
            </div>
            <div>
              <label className="block text-gray-500 mb-0.5">Qtde</label>
              <input type="number" step="any" value={form.quantidade} onChange={e => setForm(p => ({ ...p, quantidade: e.target.value }))} className={`${inp} w-20`} />
            </div>
            <div>
              <label className="block text-gray-500 mb-0.5">R$ Unit.</label>
              <input type="number" step="any" value={form.custo_unitario} onChange={e => setForm(p => ({ ...p, custo_unitario: e.target.value }))} className={`${inp} w-28`} />
            </div>
          </>
        )}
        <div className="flex gap-1">
          <button type="submit" disabled={loading} className="rounded bg-blue-600 px-3 py-1 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
            {loading ? '...' : 'Salvar'}
          </button>
          <button type="button" onClick={() => onClose()} className="rounded border px-3 py-1 text-gray-600 hover:bg-gray-100">✕</button>
        </div>
      </div>
    </form>
  )
}

// ─── Campos editáveis por tipo ────────────────────────────────────────────────

const LEAF_FIELDS  = ['codigo', 'descricao', 'unidade', 'quantidade', 'custo_unitario', 'bdi_especifico'] as const
const GROUP_FIELDS = ['descricao'] as const

function editableFields(nodo: { filhos: unknown[] }): readonly string[] {
  return nodo.filhos.length === 0 ? LEAF_FIELDS : GROUP_FIELDS
}

function fieldToStr(it: EstruturaItem, field: string): string {
  const v = (it as any)[field]
  return v != null ? String(v) : ''
}

// ─── View principal ───────────────────────────────────────────────────────────

export function PlanilhaView({ initialItems, orcamentoId, nomeOrcamento, nomePlanilha, bdiGlobal = 0, cliente, dataOrcamento, numeracaoDigitos = [1, 1, 1, 1], activePlanilhaId = null }: {
  initialItems: EstruturaItem[]
  orcamentoId: string
  nomeOrcamento?: string
  nomePlanilha?: string | null
  bdiGlobal?: number
  cliente?: string | null
  dataOrcamento?: string | null
  numeracaoDigitos?: number[]
  activePlanilhaId?: string | null
}) {
  const [items, setItems]               = useState<EstruturaItem[]>(initialItems)

  useEffect(() => {
    setItems(initialItems)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItems])
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [addingParentId, setAddingParentId] = useState<string | null | 'root'>()
  const [collapsed, setCollapsed]       = useState<Set<string>>(new Set())
  const [editingCell, setEditingCell]   = useState<{ id: string; field: string } | null>(null)
  const [cellDraft, setCellDraft]       = useState('')
  const [contextMenu, setContextMenu]   = useState<{ x: number; y: number; nodo: Nodo } | null>(null)
  const [exportError, setExportError]               = useState<string | null>(null)
  const [exportAnaliticaLoading, setExportAnaliticaLoading] = useState(false)
  const [exportAnaliticaError, setExportAnaliticaError]     = useState<string | null>(null)
  const [viewMode, setViewMode]         = useState<'sintetica' | 'analitica'>('sintetica')
  const [analiticaInsumos, setAnaliticaInsumos] = useState<Map<string, { codigo: string; descricao: string; unidade: string | null; custo: number; indice: number; origem: 'orcamento' | 'base' }[]>>(new Map())
  const [analiticaLoading, setAnaliticaLoading] = useState(false)
  const [editingInsumoCodigo, setEditingInsumoCodigo] = useState<string | null>(null)
  const [salvandoInsumoCodigo, setSalvandoInsumoCodigo] = useState<string | null>(null)
  const skipBlur                        = useRef(false)
  const syncTimerRef                    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dragActiveId, setDragActiveId] = useState<string | null>(null)
  const dragDeltaX                      = useRef(0)
  const scrollContainerRef             = useRef<HTMLDivElement>(null)
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

  // ── Dirty state / save tracking ───────────────────────────────────────────
  const router = useRouter()
  const [isDirty, setIsDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [invalidCodigos, setInvalidCodigos] = useState<Set<string>>(new Set())
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [showInvalidModal, setShowInvalidModal] = useState(false)
  const pendingHrefRef = useRef<string | null>(null)
  const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyItemsRef = useRef<Map<string, Partial<EstruturaItem>>>(new Map())
  const isSaving = saveStatus === 'saving'

  function scheduleSaved() {
    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current)
    setSaveStatus('saved')
    saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)
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
    if (editingCell) {
      saveField(editingCell.id, editingCell.field, cellDraft)
      setEditingCell(null)
    }
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
      scheduleSaved()
    } catch {
      setSaveStatus('error')
    }
  }

  function handleConfirmLeave() {
    dirtyItemsRef.current.clear()
    setShowLeaveModal(false)
    setIsDirty(false)
    const href = pendingHrefRef.current
    pendingHrefRef.current = null
    if (href) router.push(href as any)
  }

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
      const fresh = await buscarItensEstrutura(orcamentoId, activePlanilhaId)
      setItems(fresh)
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
      alert('Nenhuma composição órfã encontrada. O projeto está limpo.')
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Remove caracteres inválidos em XML 1.0 (causa de corrupção no Excel)
  function sanitize(v: unknown): string {
    if (v == null) return ''
    return String(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  }

  // Map id→item para lookups O(1) — evita items.find() em loops O(n²)
  const itemMap = useMemo(() => new Map(items.map(i => [i.id, i])), [items])

  // Rebuild tree — memoizado para não recalcular em cada keystroke/estado de UI
  const { tree, flat, grandTotal, grandTotalComBdi } = useMemo(() => {
    const t = buildTree(items)
    atribuirNumeros(t, numeracaoDigitos)
    for (const n of t) calcTotais(n, bdiGlobal)
    const gTotal = t.reduce((s, n) => s + n.total, 0)
    const gTotalBdi = t.reduce((s, n) => s + n.totalComBdi, 0)
    const f = flattenTree(t)
    return { tree: t, flat: f, grandTotal: gTotal, grandTotalComBdi: gTotalBdi }
  }, [items, bdiGlobal, numeracaoDigitos])

  // Persiste números no DB com debounce após mudanças estruturais
  function agendarSincronizacaoComItems(nextItems: EstruturaItem[]) {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      const t = buildTree(nextItems)
      atribuirNumeros(t, numeracaoDigitos)
      salvarNumeros(orcamentoId, coletarNumeros(t))
    }, 1500)
  }

  // O(n) — uma passagem em DFS. Para cada nó: se seu pai está em hiddenBelow,
  // o nó está oculto (e propaga a ocultação para seus filhos).
  const visible = useMemo(() => {
    if (collapsed.size === 0) return flat
    const hiddenBelow = new Set<string>()
    const result: typeof flat = []
    for (const entry of flat) {
      const { nodo } = entry
      if (nodo.parent_id !== null && hiddenBelow.has(nodo.parent_id)) {
        hiddenBelow.add(nodo.id)
        continue
      }
      result.push(entry)
      if (collapsed.has(nodo.id)) hiddenBelow.add(nodo.id)
    }
    return result
  }, [flat, collapsed])

  // ── Virtualização ─────────────────────────────────────────────────────────
  // Ativa quando: modo sintético + sem formulário inline + >50 linhas visíveis
  // No modo analítico, cada item tem n linhas de insumos (altura variável) → sem virtual
  const useVirtualRender = viewMode === 'sintetica' && addingParentId == null && visible.length > 50

  const rowVirtualizer = useVirtualizer({
    count: visible.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 25,   // altura estimada por linha em px
    overscan: 15,              // linhas extras fora do viewport (cima+baixo)
  })

  const virtualItems     = rowVirtualizer.getVirtualItems()
  const totalVirtualSize = rowVirtualizer.getTotalSize()
  const virtualPaddingTop    = virtualItems[0]?.start ?? 0
  const virtualPaddingBottom = Math.max(0, totalVirtualSize - (virtualItems.at(-1)?.end ?? 0))

  // Lista de linhas a renderizar: virtual (slice) ou completa (full)
  const rowsToRender = useVirtualRender
    ? virtualItems.map(v => ({ rowIdx: v.index, nodo: visible[v.index].nodo, depth: visible[v.index].depth }))
    : visible.map(({ nodo, depth }, rowIdx) => ({ rowIdx, nodo, depth }))

  // ── Curva ABC — memoizado, só recalcula quando flat/grandTotal mudam ──────
  type AbcClasse = 'A' | 'B' | 'C'
  const abcMap = useMemo(() => {
    const map = new Map<string, { percentual: number; classe: AbcClasse }>()
    if (grandTotal > 0) {
      const leafItems = flat
        .filter(({ nodo }) => nodo.filhos.length === 0 && nodo.total > 0)
        .map(({ nodo }) => ({ id: nodo.id, total: nodo.total }))
        .sort((a, b) => b.total - a.total)
      let acumulado = 0
      for (const item of leafItems) {
        const pct = (item.total / grandTotal) * 100
        acumulado += pct
        const classe: AbcClasse = acumulado <= 80 ? 'A' : acumulado <= 95 ? 'B' : 'C'
        map.set(item.id, { percentual: pct, classe })
      }
    }
    return map
  }, [flat, grandTotal])

  // Último item visível dentro do grupo onde o formulário inline vai ser injetado.
  // O(n): passa uma vez por flat (DFS) para montar o conjunto de descendentes,
  // depois uma vez por visible para achar o último.
  const formHostId = useMemo<string | null>(() => {
    if (!addingParentId || addingParentId === 'root') return null
    const inSubtree = new Set<string>([addingParentId])
    for (const { nodo } of flat) {
      if (nodo.parent_id && inSubtree.has(nodo.parent_id)) inSubtree.add(nodo.id)
    }
    let last: string | null = null
    for (const { nodo } of visible) {
      if (inSubtree.has(nodo.id)) last = nodo.id
    }
    return last
  }, [flat, visible, addingParentId])
  const addingParentGroup = addingParentId && addingParentId !== 'root'
    ? itemMap.get(addingParentId) ?? null
    : null

  function toggleCollapse(id: string) {
    setCollapsed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // ── Inline editing ──────────────────────────────────────────────────────────

  function openCell(id: string, field: string) {
    const nodoFlat = flat.find(f => f.nodo.id === id)
    if (!nodoFlat) return
    if (!editableFields(nodoFlat.nodo).includes(field)) return
    setEditingCell({ id, field })
    setCellDraft(fieldToStr(nodoFlat.nodo, field))
  }

  function saveField(id: string, field: string, draft: string) {
    let value: any
    if (field === 'quantidade' || field === 'custo_unitario' || field === 'bdi_especifico') {
      const n = parseFloat(draft.replace(',', '.'))
      value = isNaN(n) ? null : n
    } else {
      value = draft.trim() || null
    }
    if (field === 'codigo') {
      const oldCodigo = items.find(i => i.id === id)?.codigo
      if (oldCodigo) setInvalidCodigos(prev => { const s = new Set(prev); s.delete(oldCodigo); return s })
    }
    setIsDirty(true)
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it))
    // Acumula no ref — só vai ao banco ao clicar "Salvar Planilha"
    dirtyItemsRef.current.set(id, { ...dirtyItemsRef.current.get(id), [field]: value })
  }

  function navigateFrom(id: string, field: string, dir: 'tab' | 'back' | 'enter') {
    const nodoFlat = flat.find(f => f.nodo.id === id)
    if (!nodoFlat) { setEditingCell(null); return }
    const fields = editableFields(nodoFlat.nodo)
    const colIdx = (fields as readonly string[]).indexOf(field)
    const rowIdx = visible.findIndex(v => v.nodo.id === id)

    if (dir === 'tab') {
      if (colIdx < fields.length - 1) { openCell(id, fields[colIdx + 1]); return }
      for (let i = rowIdx + 1; i < visible.length; i++) {
        const f = editableFields(visible[i].nodo)
        if (f.length) { openCell(visible[i].nodo.id, f[0]); return }
      }
    } else if (dir === 'back') {
      if (colIdx > 0) { openCell(id, fields[colIdx - 1]); return }
      for (let i = rowIdx - 1; i >= 0; i--) {
        const f = editableFields(visible[i].nodo)
        if (f.length) { openCell(visible[i].nodo.id, f[f.length - 1]); return }
      }
    } else if (dir === 'enter') {
      for (let i = rowIdx + 1; i < visible.length; i++) {
        if ((editableFields(visible[i].nodo) as readonly string[]).includes(field)) { openCell(visible[i].nodo.id, field); return }
      }
    }
    setEditingCell(null)
  }

  function handleKey(e: React.KeyboardEvent, field: string) {
    if (e.key === 'Escape') {
      e.preventDefault(); skipBlur.current = true; setEditingCell(null)
    } else if (e.key === 'Tab') {
      e.preventDefault(); skipBlur.current = true
      if (editingCell) { saveField(editingCell.id, field, cellDraft); navigateFrom(editingCell.id, field, e.shiftKey ? 'back' : 'tab') }
    } else if (e.key === 'Enter') {
      e.preventDefault(); skipBlur.current = true
      if (editingCell) { saveField(editingCell.id, field, cellDraft); navigateFrom(editingCell.id, field, 'enter') }
    }
  }

  function handleBlur() {
    if (skipBlur.current) { skipBlur.current = false; return }
    if (editingCell) { saveField(editingCell.id, editingCell.field, cellDraft); setEditingCell(null) }
  }

  // ── Operações de linha ──────────────────────────────────────────────────────

  async function handleInsert(nodo: Nodo, position: 'above' | 'below') {
    setIsDirty(true)
    setContextMenu(null)

    // "Adicionar abaixo" num agrupador → cria filho
    if (position === 'below' && nodo.filhos.length > 0) {
      const newItem = await adicionarItemEstrutura(orcamentoId, nodo.id, nodo.nivel, {
        codigo: null, descricao: 'Novo item', unidade: null,
        quantidade: null, custo_unitario: null, tipo: 'item', numero: '',
      }, activePlanilhaId)
      setItems(prev => { const next = [...prev, newItem]; agendarSincronizacaoComItems(next); return next })
      setCollapsed(prev => { const s = new Set(prev); s.delete(nodo.id); return s })
      setTimeout(() => openCell(newItem.id, 'descricao'), 50)
      return
    }

    const newItem = await adicionarItemNaPosicao(orcamentoId, nodo.id, position, activePlanilhaId)
    setItems(prev => {
      const next = [...prev, newItem].map(it => {
        if (it.id === newItem.id) return it
        const sameParent = it.parent_id === nodo.parent_id
        const needsShift = position === 'above'
          ? sameParent && it.ordem >= nodo.ordem && it.id !== newItem.id
          : sameParent && it.ordem > nodo.ordem && it.id !== newItem.id
        return needsShift ? { ...it, ordem: it.ordem + 1 } : it
      })
      agendarSincronizacaoComItems(next)
      return next
    })
    setTimeout(() => openCell(newItem.id, 'descricao'), 50)
  }

  async function handleAfterCreate(newItem: EstruturaItem) {
    setIsDirty(true)
    setItems(prev => {
      const next = [...prev, newItem]
      agendarSincronizacaoComItems(next)
      return next
    })
    setAddingParentId(undefined)
    setTimeout(() => openCell(newItem.id, 'descricao'), 50)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este item e todos seus sub-itens?')) return
    setIsDirty(true)
    setDeletingId(id)
    const toRemove = new Set<string>()
    function collect(itemId: string) {
      toRemove.add(itemId)
      for (const it of itemMap.values()) if (it.parent_id === itemId) collect(it.id)
    }
    collect(id)
    setItems(prev => { const next = prev.filter(it => !toRemove.has(it.id)); agendarSincronizacaoComItems(next); return next })
    await deletarItemEstrutura(id, orcamentoId)
    setDeletingId(null)
  }

  async function handleMoveRow(nodo: Nodo, direction: 'up' | 'down') {
    setIsDirty(true)
    const siblings = items
      .filter(it => it.parent_id === nodo.parent_id)
      .sort((a, b) => a.ordem - b.ordem)
    const idx = siblings.findIndex(it => it.id === nodo.id)
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= siblings.length) return
    const target = siblings[targetIdx]
    const newOrdem = target.ordem
    const oldOrdem = nodo.ordem
    setItems(prev => {
      const next = prev.map(it => {
        if (it.id === nodo.id) return { ...it, ordem: newOrdem }
        if (it.id === target.id) return { ...it, ordem: oldOrdem }
        return it
      })
      agendarSincronizacaoComItems(next)
      return next
    })
    await Promise.all([
      atualizarItemEstrutura(nodo.id, orcamentoId, { ordem: newOrdem }),
      atualizarItemEstrutura(target.id, orcamentoId, { ordem: oldOrdem }),
    ])
  }

  async function addSheetHeader(wb: any, ws: any, titulo: string) {
    const hFill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
    const hBdr  = (style: 'thin' | 'medium', argb: string) => ({ style, color: { argb } })
    const dataStr = dataOrcamento
      ? new Date(dataOrcamento + 'T00:00:00').toLocaleDateString('pt-BR')
      : new Date().toLocaleDateString('pt-BR')

    const r1 = ws.addRow([]); r1.height = 32
    const r2 = ws.addRow([]); r2.height = 22
    const r3 = ws.addRow([]); r3.height = 5

    ws.mergeCells('A1:B1')
    ws.mergeCells('A2:B2')
    ws.mergeCells('C1:E2')
    ws.mergeCells('F1:G1')
    ws.mergeCells('F2:G2')

    try {
      const resp = await fetch('/logofs.png')
      if (resp.ok) {
        const buf = await resp.arrayBuffer()
        const imgId = wb.addImage({ buffer: buf, extension: 'png' })
        ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 130, height: 32 } })
      }
    } catch { /* logo opcional */ }

    const outerBdr = { top: hBdr('medium', 'FF334155'), bottom: hBdr('medium', 'FF334155'), left: hBdr('medium', 'FF334155'), right: hBdr('medium', 'FF334155') }

    const logoCell = ws.getCell('A1')
    logoCell.fill = hFill('FFFFFFFF')
    logoCell.border = { ...outerBdr, bottom: hBdr('thin', 'FFE2E8F0'), right: hBdr('thin', 'FFE2E8F0') }

    const infoCell = ws.getCell('A2')
    infoCell.value = `Cliente: ${cliente ?? '—'}     Obra: ${nomeOrcamento ?? '—'}`
    infoCell.font = { name: 'Calibri', size: 8, color: { argb: 'FF374151' } }
    infoCell.alignment = { vertical: 'middle', horizontal: 'left' }
    infoCell.fill = hFill('FFF8FAFC')
    infoCell.border = { ...outerBdr, top: hBdr('thin', 'FFE2E8F0'), right: hBdr('thin', 'FFE2E8F0') }

    const titleCell = ws.getCell('C1')
    titleCell.value = titulo
    titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    titleCell.fill = hFill('FF1E293B')
    titleCell.border = { ...outerBdr, left: hBdr('thin', 'FF334155'), right: hBdr('thin', 'FF334155') }

    const revCell = ws.getCell('F1')
    revCell.value = 'REV 00'
    revCell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FF374151' } }
    revCell.alignment = { horizontal: 'right', vertical: 'middle' }
    revCell.fill = hFill('FFF8FAFC')
    revCell.border = { ...outerBdr, left: hBdr('thin', 'FFE2E8F0'), bottom: hBdr('thin', 'FFE2E8F0') }

    const dateCell = ws.getCell('F2')
    dateCell.value = `Data: ${dataStr}`
    dateCell.font = { name: 'Calibri', size: 8, color: { argb: 'FF374151' } }
    dateCell.alignment = { horizontal: 'right', vertical: 'middle' }
    dateCell.fill = hFill('FFF8FAFC')
    dateCell.border = { ...outerBdr, left: hBdr('thin', 'FFE2E8F0'), top: hBdr('thin', 'FFE2E8F0') }
  }

  async function handleExport() {
    setExportError(null)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'FS Orçamento'
      const ws = wb.addWorksheet('Planilha')

      const C = {
        slate800: 'FF1E293B', slate700: 'FF334155', slate50:  'FFF8FAFC',
        blue50:   'FFEFF6FF', blue950:  'FF172554',
        white:    'FFFFFFFF', gray700:  'FF374151',
        headerBg: 'FFF1F5F9', headerFg: 'FF64748B',
        border:   'FFE2E8F0', borderDk: 'FF475569',
      }
      const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
      const bdr  = (style: 'thin' | 'medium', argb: string) => ({ style, color: { argb } })

      ws.columns = [
        { width: 10 }, { width: 13 }, { width: 52 },
        { width:  6 }, { width: 12 }, { width: 15 }, { width: 16 },
      ]

      await addSheetHeader(wb, ws, 'PLANILHA DE ORÇAMENTO')

      // Cabeçalho de colunas
      const hRow = ws.addRow(['Item', 'Código', 'Descrição', 'Und', 'Qtde', 'R$ Unit.', 'R$ Total'])
      hRow.height = 20
      hRow.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.fill = fill(C.headerBg)
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.headerFg } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('medium', C.borderDk), bottom: bdr('medium', C.borderDk), left: bdr('thin', C.border), right: bdr('thin', C.border) }
      })

      // Linhas de dados — usar '' em vez de null garante que todas as 7 células
      // existam na linha, permitindo que eachCell itere corretamente até a col 7
      for (const { nodo, depth } of flat) {
        const isItem = nodo.tipo === 'item'
        const total  = isItem ? (nodo.quantidade ?? 0) * (nodo.custo_unitario ?? 0) : nodo.total
        const row = ws.addRow([
          sanitize(nodo.numero)  || '',
          sanitize(nodo.codigo)  || '',
          sanitize('  '.repeat(depth) + nodo.descricao) || '',
          sanitize(nodo.unidade) || '',
          isItem && nodo.quantidade     != null ? nodo.quantidade     : '',
          isItem && nodo.custo_unitario != null ? nodo.custo_unitario : '',
          total > 0 ? total : '',
        ])

        let bg: string, fg: string, bold: boolean, sz: number, ht: number
        if      (depth === 0) { bg = C.slate800; fg = C.white;   bold = true;  sz = 10; ht = 18 }
        else if (depth === 1) { bg = C.blue50;   fg = C.blue950; bold = true;  sz = 9;  ht = 15 }
        else if (depth === 2) { bg = C.slate50;  fg = C.gray700; bold = false; sz = 9;  ht = 15 }
        else                  { bg = C.white;    fg = C.gray700; bold = false; sz = 9;  ht = 15 }

        row.height = ht
        const dk = depth <= 0
        row.eachCell({ includeEmpty: true }, (cell, c) => {
          cell.fill = fill(bg)
          cell.font = { name: 'Calibri', size: sz, bold, color: { argb: fg } }
          cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
          cell.border = { top: bdr('thin', dk ? C.borderDk : C.border), bottom: bdr('thin', dk ? C.borderDk : C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
          if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
        })
      }

      // Total geral
      const tRow = ws.addRow(['', '', 'TOTAL GERAL', '', '', '', grandTotal])
      tRow.height = 20
      tRow.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.fill = fill(C.slate800)
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: c === 3 ? C.headerFg : C.white } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : c === 3 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('medium', C.slate700), bottom: bdr('thin', C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
        if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
      })

      const slug = (nomeOrcamento ?? 'planilha').replace(/[/\\?%*:|"<>]/g, '-').trim()
      const buf  = await wb.xlsx.writeBuffer()
      const url  = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a    = document.createElement('a')
      a.href = url; a.download = `${slug}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Erro ao gerar o arquivo Excel.')
    }
  }

  async function fetchInsumosByCodigo(): Promise<Map<string, { codigo: string; descricao: string; unidade: string | null; custo: number; indice: number; origem: 'orcamento' | 'base' }[]>> {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 30_000)
    try {
      const sb = createClient() as any
      const { data: composicoes, error: compError } = await sb
        .from('orcamento_composicoes')
        .select('id, codigo')
        .eq('orcamento_id', orcamentoId)
        .abortSignal(ac.signal)
      if (compError) throw ac.signal.aborted ? new Error('Tempo limite excedido. Verifique sua conexão.') : compError
      const idToCodigo = new Map<string, string>()
      for (const c of composicoes ?? []) idToCodigo.set(c.id, c.codigo)
      const compIds = (composicoes ?? []).map((c: any) => c.id)
      const result = new Map<string, { codigo: string; descricao: string; unidade: string | null; custo: number; indice: number; origem: 'orcamento' | 'base' }[]>()
      if (compIds.length > 0) {
        const { data: insumos, error: insError } = await sb
          .from('orcamento_insumos')
          .select('composicao_id, codigo, descricao, unidade, custo, indice')
          .in('composicao_id', compIds)
          .abortSignal(ac.signal)
        if (insError) throw ac.signal.aborted ? new Error('Tempo limite excedido. Verifique sua conexão.') : insError
        for (const ins of insumos ?? []) {
          const cod = idToCodigo.get(ins.composicao_id)
          if (!cod) continue
          if (!result.has(cod)) result.set(cod, [])
          result.get(cod)!.push({ codigo: ins.codigo ?? '', descricao: ins.descricao ?? '', unidade: ins.unidade, custo: ins.custo ?? 0, indice: ins.indice ?? 0, origem: 'orcamento' })
        }
      }

      // Fallback: itens importados em modo sintética não possuem composição
      // própria no orçamento — busca a composição analítica na base global.
      const codigosFaltantes = [...new Set(
        items
          .filter(i => i.tipo === 'item' && i.codigo && !result.has(i.codigo))
          .map(i => i.codigo as string)
      )]
      if (codigosFaltantes.length > 0) {
        const { data: composicoesBase, error: compBaseError } = await sb
          .from('tabela_composicoes')
          .select('id, codigo')
          .in('codigo', codigosFaltantes)
          .abortSignal(ac.signal)
        if (compBaseError) throw ac.signal.aborted ? new Error('Tempo limite excedido. Verifique sua conexão.') : compBaseError
        const idToCodigoBase = new Map<string, string>()
        for (const c of composicoesBase ?? []) idToCodigoBase.set(c.id, c.codigo)
        const compIdsBase = (composicoesBase ?? []).map((c: any) => c.id)
        if (compIdsBase.length > 0) {
          const { data: itensBase, error: itensBaseError } = await sb
            .from('tabela_itens_composicao')
            .select('composicao_id, indice, tabela_insumos(codigo, descricao, unidade, preco_base)')
            .in('composicao_id', compIdsBase)
            .abortSignal(ac.signal)
          if (itensBaseError) throw ac.signal.aborted ? new Error('Tempo limite excedido. Verifique sua conexão.') : itensBaseError
          for (const it of itensBase ?? []) {
            const cod = idToCodigoBase.get(it.composicao_id)
            const insumo = it.tabela_insumos
            if (!cod || !insumo) continue
            if (!result.has(cod)) result.set(cod, [])
            result.get(cod)!.push({
              codigo: insumo.codigo ?? '',
              descricao: insumo.descricao ?? '',
              unidade: insumo.unidade ?? null,
              custo: insumo.preco_base ?? 0,
              indice: it.indice ?? 0,
              origem: 'base',
            })
          }
        }
      }

      return result
    } finally {
      clearTimeout(timer)
    }
  }

  async function handleExportAnalitica() {
    setExportAnaliticaError(null)
    setExportAnaliticaLoading(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const insumoData = analiticaInsumos.size > 0
        ? analiticaInsumos
        : await fetchInsumosByCodigo()

      const wb = new ExcelJS.Workbook()
      wb.creator = 'FS Orçamento'
      const ws = wb.addWorksheet('Planilha Analítica')

      const C = {
        slate800: 'FF1E293B', slate700: 'FF334155', slate50:  'FFF8FAFC',
        blue50:   'FFEFF6FF', blue950:  'FF172554',
        white:    'FFFFFFFF', gray700:  'FF374151',
        headerBg: 'FFF1F5F9', headerFg: 'FF64748B',
        border:   'FFE2E8F0', borderDk: 'FF475569',
        insumoFg: 'FF4B5563', insumoBdr: 'FFF0F4F8',
      }
      const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
      const bdr  = (style: 'thin' | 'medium', argb: string) => ({ style, color: { argb } })

      ws.columns = [
        { width: 10 }, { width: 13 }, { width: 55 },
        { width:  6 }, { width: 12 }, { width: 15 }, { width: 16 },
      ]

      await addSheetHeader(wb, ws, 'PLANILHA ANALÍTICA DE PREÇOS UNITÁRIOS')

      // Cabeçalho de colunas
      const hRow = ws.addRow(['Item', 'Código', 'Descrição', 'Und', 'Qtde', 'R$ Unit.', 'R$ Total'])
      hRow.height = 20
      hRow.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.fill = fill(C.headerBg)
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.headerFg } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('medium', C.borderDk), bottom: bdr('medium', C.borderDk), left: bdr('thin', C.border), right: bdr('thin', C.border) }
      })

      // Usar '' em vez de null garante que eachCell itere todas as 7 colunas
      for (const { nodo, depth } of flat) {
        const isItem = nodo.tipo === 'item'
        const total  = isItem ? (nodo.quantidade ?? 0) * (nodo.custo_unitario ?? 0) : nodo.total

        const row = ws.addRow([
          sanitize(nodo.numero)  || '',
          sanitize(nodo.codigo)  || '',
          sanitize('  '.repeat(depth) + nodo.descricao) || '',
          sanitize(nodo.unidade) || '',
          isItem && nodo.quantidade     != null ? nodo.quantidade     : '',
          isItem && nodo.custo_unitario != null ? nodo.custo_unitario : '',
          total > 0 ? total : '',
        ])

        let bg: string, fg: string, bold: boolean, sz: number, ht: number
        if (isItem)           { bg = C.slate50;  fg = C.gray700; bold = false; sz = 9;  ht = 15 }
        else if (depth === 0) { bg = C.slate800; fg = C.white;   bold = true;  sz = 10; ht = 18 }
        else if (depth === 1) { bg = C.blue50;   fg = C.blue950; bold = true;  sz = 9;  ht = 15 }
        else                  { bg = C.slate50;  fg = C.gray700; bold = true;  sz = 9;  ht = 15 }

        row.height = ht
        const dk = !isItem && depth === 0
        row.eachCell({ includeEmpty: true }, (cell, c) => {
          cell.fill = fill(bg)
          cell.font = { name: 'Calibri', size: sz, bold, color: { argb: fg } }
          cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
          cell.border = { top: bdr('thin', dk ? C.borderDk : C.border), bottom: bdr('thin', dk ? C.borderDk : C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
          if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
        })

        // Linhas de insumos
        if (isItem && nodo.codigo) {
          const insumosForComp = insumoData.get(nodo.codigo) ?? []
          for (const ins of insumosForComp) {
            const custoTotal = (ins.indice ?? 0) * (ins.custo ?? 0)
            const iRow = ws.addRow([
              '',
              sanitize(ins.codigo) || '',
              sanitize('    ' + ins.descricao) || '',
              sanitize(ins.unidade ?? '') || '',
              ins.indice ?? '',
              ins.custo  ?? '',
              custoTotal > 0 ? custoTotal : '',
            ])
            iRow.height = 13
            iRow.eachCell({ includeEmpty: true }, (cell, c) => {
              cell.fill = fill(C.white)
              cell.font = { name: 'Calibri', size: 8, bold: false, color: { argb: C.insumoFg } }
              cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
              cell.border = { top: bdr('thin', C.insumoBdr), bottom: bdr('thin', C.insumoBdr), left: bdr('thin', C.border), right: bdr('thin', C.border) }
              if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
              if (c === 5 && typeof cell.value === 'number')              cell.numFmt = '#,##0.0000'
            })
          }
        }
      }

      // Total geral
      const tRow = ws.addRow(['', '', 'TOTAL GERAL', '', '', '', grandTotal])
      tRow.height = 20
      tRow.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.fill = fill(C.slate800)
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: c === 3 ? C.headerFg : C.white } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : c === 3 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('medium', C.slate700), bottom: bdr('thin', C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
        if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
      })

      const slug = (nomeOrcamento ?? 'planilha').replace(/[/\\?%*:|"<>]/g, '-').trim()
      const buf  = await wb.xlsx.writeBuffer()
      const url  = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a    = document.createElement('a')
      a.href = url; a.download = `${slug}_analitica.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportAnaliticaError(err instanceof Error ? err.message : 'Erro ao gerar o arquivo Excel.')
    } finally {
      setExportAnaliticaLoading(false)
    }
  }

  async function loadAnaliticaData() {
    if (analiticaInsumos.size > 0) return
    setAnaliticaLoading(true)
    try {
      const data = await fetchInsumosByCodigo()
      setAnaliticaInsumos(data)
    } catch {
      // silently ignore — analítica view shows empty insumos on failure
    } finally {
      setAnaliticaLoading(false)
    }
  }

  // Edita o preço canônico de um insumo a partir da visão Analítica. Atualiza
  // localmente TODAS as ocorrências desse código na árvore (não só a linha
  // clicada) — o preço é do insumo no projeto inteiro, não da linha.
  async function handleSalvarCustoInsumo(codigo: string, descricao: string, unidade: string | null, custoAtual: number, rawValue: string) {
    setEditingInsumoCodigo(null)
    const str = rawValue.trim().replace(',', '.')
    const parsed = str === '' ? 0 : parseFloat(str)
    if (isNaN(parsed) || parsed < 0 || parsed === custoAtual) return

    setSalvandoInsumoCodigo(codigo)
    try {
      await atualizarPrecoInsumoAction(orcamentoId, codigo, parsed, { descricao, unidade: unidade ?? undefined })
      setAnaliticaInsumos(prev => {
        const next = new Map<string, { codigo: string; descricao: string; unidade: string | null; custo: number; indice: number; origem: 'orcamento' | 'base' }[]>()
        for (const [comp, lista] of prev) {
          next.set(comp, lista.map(ins => (ins.codigo === codigo ? { ...ins, custo: parsed } : ins)))
        }
        return next
      })
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erro ao salvar custo do insumo.')
    } finally {
      setSalvandoInsumoCodigo(null)
    }
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────────

  function computeProjection(activeId: string, overId: string, deltaX: number): { parentId: string | null; ordem: number } | null {
    if (activeId === overId) return null
    const flatAll = flat // usa a flat já memoizada — evita O(n) a cada drag move
    const overIdx = flatAll.findIndex(f => f.nodo.id === overId)
    const activeEntry = flatAll.find(f => f.nodo.id === activeId)
    if (overIdx === -1 || !activeEntry) return null

    // Impede mover para dentro de descendente
    function isDesc(pid: string | null, target: string): boolean {
      let c: string | null = pid
      while (c) { if (c === target) return true; c = itemMap.get(c)?.parent_id ?? null }
      return false
    }
    if (isDesc(overId === activeId ? null : overId, activeId)) return null

    const INDENT = 20
    const depthDelta = Math.round(deltaX / INDENT)
    const currentDepth = activeEntry.depth
    const targetDepth = Math.max(0, currentDepth + depthDelta)

    // Encontra o parentId para o targetDepth: sobe nos itens acima do `over`
    let newParentId: string | null = null
    if (targetDepth > 0) {
      for (let i = overIdx - 1; i >= 0; i--) {
        const { nodo: c, depth: d } = flatAll[i]
        if (c.id === activeId) continue
        if (d === targetDepth - 1) { newParentId = c.id; break }
        if (d < targetDepth - 1) { newParentId = c.id; break }
      }
    }

    // Ordem: posiciona logo antes do `over` item entre os irmãos do novo pai
    const siblings = items
      .filter(i => i.parent_id === newParentId && i.id !== activeId)
      .sort((a, b) => a.ordem - b.ordem)
    const overSibIdx = siblings.findIndex(s => s.id === overId)
    const novaOrdem = overSibIdx >= 0 ? siblings[overSibIdx].ordem : (siblings.at(-1)?.ordem ?? -1) + 1

    return { parentId: newParentId, ordem: novaOrdem }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setDragActiveId(null)
    if (!over || active.id === over.id) return
    setIsDirty(true)

    const proj = computeProjection(String(active.id), String(over.id), dragDeltaX.current)
    if (!proj) return

    const activeItem = itemMap.get(String(active.id))
    if (!activeItem) return

    // Atualiza estado local
    setItems(prev => {
      const next = prev.map(it =>
        it.id === active.id
          ? { ...it, parent_id: proj.parentId, nivel: (proj.parentId ? (prev.find(p => p.id === proj.parentId)?.nivel ?? 0) + 1 : 1), ordem: proj.ordem }
          : it
      )
      agendarSincronizacaoComItems(next)
      return next
    })

    // Persiste no servidor
    await moverItem(orcamentoId, String(active.id), proj.parentId, proj.ordem)
  }

  // ── Estilos reutilizáveis ───────────────────────────────────────────────────

  const INP = 'w-full bg-white text-gray-900 outline-none ring-2 ring-inset ring-blue-500 rounded-sm text-xs px-1.5 py-0.5'
  const CELL_HOVER = 'cursor-text select-none rounded px-1 -mx-1 hover:bg-white/40 hover:ring-1 hover:ring-blue-300 min-h-[1.2rem] leading-relaxed transition-all'

  // Renderiza uma célula de texto simples
  function textCell(nodo: Nodo, field: string, display: React.ReactNode, extraInpClass = '') {
    const editing = editingCell?.id === nodo.id && editingCell?.field === field
    if (editing) return (
      <input autoFocus value={cellDraft} onChange={e => setCellDraft(e.target.value)}
        onKeyDown={e => handleKey(e, field)} onBlur={handleBlur}
        className={`${INP} ${extraInpClass}`} />
    )
    return <div onClick={() => openCell(nodo.id, field)} className={CELL_HOVER}>{display}</div>
  }

  // Renderiza uma célula numérica
  function numCell(nodo: Nodo, field: string, display: React.ReactNode) {
    const editing = editingCell?.id === nodo.id && editingCell?.field === field
    if (editing) return (
      <input autoFocus type="number" step="any" min="0" value={cellDraft}
        onChange={e => setCellDraft(e.target.value)}
        onKeyDown={e => handleKey(e, field)} onBlur={handleBlur}
        className={`${INP} text-right`} />
    )
    return <div onClick={() => openCell(nodo.id, field)} className={`${CELL_HOVER} text-right`}>{display}</div>
  }



  return (
    <div className="space-y-3">
      {/* Resumo do orçamento */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4">
        <div className="flex flex-wrap gap-x-8 gap-y-3 items-start">
          {nomePlanilha && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Planilha ativa</p>
              <p className="text-sm font-bold text-blue-700 mt-0.5">{nomePlanilha}</p>
            </div>
          )}
          {cliente && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Cliente</p>
              <p className="text-sm font-medium text-gray-800 mt-0.5">{cliente}</p>
            </div>
          )}
          {dataOrcamento && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Data</p>
              <p className="text-sm font-medium text-gray-800 mt-0.5">
                {new Date(dataOrcamento + 'T00:00:00').toLocaleDateString('pt-BR')}
              </p>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">BDI Global</p>
            <p className="text-sm font-bold text-blue-700 mt-0.5">{bdiGlobal}%</p>
          </div>
        </div>
      </div>

      {/* Barra de ferramentas */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <button onClick={() => setAddingParentId('root')}
            className="flex items-center gap-1.5 rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Capítulo
          </button>
          <button
            onClick={async () => {
              if (!confirm('Excluir toda a planilha orçamentária? Esta ação não pode ser desfeita.')) return
              try {
                const { removidos } = await limparPlanilha(orcamentoId, activePlanilhaId)
                setItems([])
                alert(`${removidos} item(ns) removido(s) com sucesso.`)
              } catch (err) {
                alert((err as Error).message)
              }
            }}
            className="flex items-center gap-1.5 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Excluir planilha
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs shadow-sm">
            <button
              onClick={() => setViewMode('sintetica')}
              className={`px-3 py-1.5 font-medium transition-colors ${viewMode === 'sintetica' ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Sintética
            </button>
            <button
              onClick={async () => { await loadAnaliticaData(); setViewMode('analitica') }}
              disabled={analiticaLoading}
              className={`px-3 py-1.5 font-medium transition-colors border-l border-gray-200 disabled:opacity-60 ${viewMode === 'analitica' ? 'bg-slate-800 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {analiticaLoading ? '...' : 'Analítica'}
            </button>
          </div>
          {/* Indicador de status + botão Salvar */}
          <div className="flex items-center gap-2">
            <div className="text-right text-[11px]">
              {isSaving ? (
                <span className="flex items-center gap-1 text-blue-600">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Salvando...
                </span>
              ) : saveStatus === 'saved' ? (
                <span className="flex items-center gap-1 text-green-600">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Todas as alterações foram salvas
                </span>
              ) : saveStatus === 'error' ? (
                <span className="text-red-600">Falha ao salvar. Tente novamente.</span>
              ) : isDirty ? (
                <span className="flex items-center gap-1 text-orange-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
                  Alterações não salvas
                </span>
              ) : null}
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving || invalidCodigos.size > 0}
              className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60 transition-colors shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {isSaving ? 'Salvando...' : 'Salvar Planilha'}
            </button>
          </div>

          {calcResultado && !calcErro && (
            <div className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${calcResultado.itens === 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
              {calcResultado.itens === 0 ? (
                <>
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Nenhum item atualizado — verifique se os códigos dos insumos correspondem à planilha
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {calcResultado.itens} item(ns) atualizado(s)
                  {calcResultado.comps > 0 && ` a partir de ${calcResultado.comps} composição(ões)`}
                </>
              )}
              <button onClick={() => setCalcResultado(null)} className="ml-1 opacity-50 hover:opacity-100">×</button>
            </div>
          )}

          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Total Geral</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums">{BRL(grandTotal)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              {/* Botão Ferramentas com painel suspenso */}
              <div className="relative" ref={calcPanelRef}>
                <button
                  onClick={() => setCalcPanelOpen(v => !v)}
                  disabled={calcMode !== null || verificando}
                  className="flex items-center gap-1.5 rounded-md bg-gray-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-60 transition-colors shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {calcMode === 'projeto' ? 'Calculando projeto…' : calcMode === 'planilha' ? 'Calculando planilha…' : verificando ? 'Verificando…' : 'Ferramentas'}
                  <svg
                    className={`w-3 h-3 transition-transform ${calcPanelOpen ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {calcPanelOpen && (
                  <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
                    {/* Header */}
                    <div className="bg-gray-700 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-widest text-white">Ferramentas do Projeto</p>
                    </div>

                    {/* Valores resumidos */}
                    <div className="px-4 py-3 flex gap-4 justify-center border-b border-gray-100 bg-gray-50">
                      <div className="text-center">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Custo</p>
                        <p className="text-sm font-bold text-gray-900 tabular-nums">{BRL(grandTotal)}</p>
                      </div>
                      <div className="w-px bg-gray-200" />
                      <div className="text-center">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Com BDI</p>
                        <p className="text-sm font-bold text-gray-900 tabular-nums">{BRL(grandTotalComBdi)}</p>
                      </div>
                    </div>

                    {/* Cálculo */}
                    <div className="px-3 pt-2 pb-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Cálculo</p>
                    </div>
                    <div className="px-2 pb-1 space-y-0.5">
                      <button
                        onClick={() => handleCalcular('planilha')}
                        disabled={calcMode !== null}
                        className="w-full text-left flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs text-gray-800 hover:bg-blue-50 disabled:opacity-40 transition-colors"
                      >
                        <svg className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>
                          <span className="block font-medium">Calcular Planilha</span>
                          <span className="text-[10px] text-gray-400 font-normal leading-tight">Recalcula apenas <strong className="text-gray-600">{nomePlanilha ?? 'esta planilha'}</strong>. Atualiza os preços e totais desta planilha.</span>
                        </span>
                      </button>
                      <button
                        onClick={() => handleCalcular('projeto')}
                        disabled={calcMode !== null}
                        className="w-full text-left flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs text-gray-800 hover:bg-green-50 disabled:opacity-40 transition-colors"
                      >
                        <svg className="w-4 h-4 shrink-0 mt-0.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>
                          <span className="block font-medium">Calcular Projeto</span>
                          <span className="text-[10px] text-gray-400 font-normal leading-tight">Recalcula todas as planilhas do projeto. Exibe custo e valor com BDI por planilha.</span>
                        </span>
                      </button>
                    </div>

                    {/* Manutenção */}
                    <div className="border-t border-gray-100 px-3 pt-2 pb-0.5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Manutenção</p>
                    </div>
                    <div className="px-2 pb-2 space-y-0.5">
                      <button
                        onClick={handleVerificarConsistencia}
                        disabled={verificando}
                        className="w-full text-left flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs text-gray-800 hover:bg-amber-50 disabled:opacity-40 transition-colors"
                      >
                        <svg className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>
                          <span className="block font-medium">Verificar Consistência</span>
                          <span className="text-[10px] text-gray-400 font-normal leading-tight">Detecta referências quebradas, composições vazias e valores inválidos.</span>
                        </span>
                      </button>
                      <button
                        onClick={handleLimparProjeto}
                        className="w-full text-left flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs text-red-700 hover:bg-red-50 transition-colors"
                      >
                        <svg className="w-4 h-4 shrink-0 mt-0.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span>
                          <span className="block font-medium">Limpar Projeto</span>
                          <span className="text-[10px] text-red-400 font-normal leading-tight">Remove composições e insumos não utilizados. Protege bases nacionais.</span>
                        </span>
                      </button>
                    </div>

                    {calcMode && (
                      <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-2 text-[11px] text-gray-600 bg-gray-50">
                        <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {calcMode === 'projeto' ? 'Recalculando o projeto…' : 'Recalculando a planilha…'}
                      </div>
                    )}

                    {/* Log de execução do motor */}
                    {calcLogs.length > 0 && (
                      <div className="px-4 pb-3 border-t border-orange-200">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700 mt-2 mb-1">Log de execução</p>
                        <ul className="space-y-0.5">
                          {calcLogs.map((msg, i) => {
                            const isErro = msg.startsWith('Erro')
                            const isConcluido = msg.includes('concluído')
                            return (
                              <li key={i} className={`flex items-start gap-1.5 text-[11px] ${isErro ? 'text-red-600' : isConcluido ? 'text-green-700 font-medium' : 'text-orange-800'}`}>
                                <span className="shrink-0 mt-0.5">
                                  {isErro ? '✕' : isConcluido ? '✓' : '·'}
                                </span>
                                {msg}
                              </li>
                            )
                          })}
                        </ul>
                        {calcErro && (
                          <p className="mt-2 text-[11px] text-red-600 bg-red-50 rounded px-2 py-1">{calcErro}</p>
                        )}
                      </div>
                    )}

                    {/* Ajustar valor do orçamento */}
                    <div className="px-4 py-3 border-t border-orange-200 bg-orange-100/50">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700 mb-2">
                        Ajustar valor do orçamento
                      </p>
                      <div className="flex gap-4 mb-3">
                        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                          <input
                            type="radio"
                            name="tipoValorFinal"
                            value="custo"
                            checked={tipoValorFinal === 'custo'}
                            onChange={() => setTipoValorFinal('custo')}
                            className="accent-orange-500"
                          />
                          Valor final (Custo)
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                          <input
                            type="radio"
                            name="tipoValorFinal"
                            value="venda"
                            checked={tipoValorFinal === 'venda'}
                            onChange={() => setTipoValorFinal('venda')}
                            className="accent-orange-500"
                          />
                          Valor final (Venda)
                        </label>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="text-xs text-orange-700 font-medium shrink-0">R$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={valorFinalInput}
                          onChange={e => setValorFinalInput(e.target.value.replace(/[^0-9,.]/g, ''))}
                          className="flex-1 rounded-md border border-orange-300 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-400"
                        />
                      </div>
                      {(() => {
                        const num = parseFloat(valorFinalInput.replace(/\./g, '').replace(',', '.'))
                        if (!num || num <= 0) return null
                        const base = tipoValorFinal === 'custo' ? grandTotal : grandTotalComBdi
                        const fator = base > 0 ? num / base : 0
                        const bdiNecessario = tipoValorFinal === 'venda' && grandTotal > 0
                          ? (num / grandTotal - 1) * 100
                          : null
                        return (
                          <div className="mt-2 rounded-md bg-white border border-orange-200 px-3 py-2 space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-gray-500">Fator de ajuste</span>
                              <span className="font-semibold text-gray-800 tabular-nums">{fator.toFixed(4)}×</span>
                            </div>
                            {bdiNecessario !== null && (
                              <div className="flex justify-between text-[11px]">
                                <span className="text-gray-500">BDI necessário</span>
                                <span className="font-semibold text-blue-700 tabular-nums">{bdiNecessario.toFixed(2)}%</span>
                              </div>
                            )}
                            <div className="flex justify-between text-[11px] border-t border-orange-100 pt-1 mt-1">
                              <span className="text-gray-500">Diferença</span>
                              <span className={`font-semibold tabular-nums ${num - base >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {num - base >= 0 ? '+' : ''}{BRL(num - base)}
                              </span>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                )}
              </div>

              <button onClick={handleExport}
                className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Exportar XLSX
              </button>
              <button onClick={handleExportAnalitica} disabled={exportAnaliticaLoading}
                className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors shadow-sm disabled:opacity-60">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {exportAnaliticaLoading ? 'Exportando...' : 'Exportar Analítica'}
              </button>
            </div>
            {exportError && (
              <p className="text-xs text-red-600 max-w-xs text-right">{exportError}</p>
            )}
            {exportAnaliticaError && (
              <p className="text-xs text-red-600 max-w-xs text-right">{exportAnaliticaError}</p>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Resultado Calcular Projeto */}
      {totaisProjetoResult && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-gray-800 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Cálculo do Projeto</h2>
                <p className="text-xs text-gray-400 mt-0.5">Totais por planilha após recálculo completo</p>
              </div>
              <button onClick={() => setTotaisProjetoResult(null)} className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Planilha</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Custo</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Com BDI</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {totaisProjetoResult.map(p => (
                    <tr key={p.planilhaId} className={`hover:bg-gray-50 transition-colors ${p.planilhaId === activePlanilhaId ? 'bg-blue-50/60' : ''}`}>
                      <td className="px-4 py-3 font-medium text-gray-800 flex items-center gap-2">
                        {p.planilhaId === activePlanilhaId && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        )}
                        {p.nome}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-700">{BRL(p.totalCusto)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{BRL(p.totalComBdi)}</td>
                    </tr>
                  ))}
                </tbody>
                {totaisProjetoResult.length > 1 && (
                  <tfoot>
                    <tr className="bg-gray-800">
                      <td className="px-4 py-3 text-xs font-bold text-gray-200 uppercase tracking-wider">Total Projeto</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-100">
                        {BRL(totaisProjetoResult.reduce((s, p) => s + p.totalCusto, 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-white">
                        {BRL(totaisProjetoResult.reduce((s, p) => s + p.totalComBdi, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {calcErro && (
              <div className="px-6 py-3 bg-red-50 border-t border-red-200">
                <p className="text-xs text-red-600">{calcErro}</p>
              </div>
            )}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setTotaisProjetoResult(null)}
                className="rounded-lg bg-gray-800 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Alterações não salvas */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-orange-500 px-6 py-4">
              <h2 className="text-base font-bold text-white">Alterações não salvas</h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600 leading-relaxed">
                Existem alterações que ainda não foram salvas. Se você sair agora, todas as modificações realizadas serão perdidas.
              </p>
            </div>
            <div className="px-6 pb-5 flex gap-3 justify-end">
              <button
                onClick={() => setShowLeaveModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Continuar editando
              </button>
              <button
                onClick={handleConfirmLeave}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600 transition-colors"
              >
                Sair sem salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Composições inválidas */}
      {showInvalidModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-red-600 px-6 py-4">
              <h2 className="text-base font-bold text-white">Composições inválidas encontradas</h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-600 leading-relaxed">
                Foram identificadas composições que não existem mais na base de dados. Corrija os itens destacados antes de sair ou salvar a planilha.
              </p>
              <ul className="mt-3 space-y-1">
                {[...invalidCodigos].map(c => (
                  <li key={c} className="flex items-center gap-2 text-xs text-red-700 bg-red-50 rounded px-2 py-1">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Código <span className="font-mono font-bold">{c}</span> não encontrado
                  </li>
                ))}
              </ul>
            </div>
            <div className="px-6 pb-5 flex gap-3 justify-end">
              <button
                onClick={() => setShowInvalidModal(false)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                Permanecer na planilha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menu de contexto (botão direito) */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 min-w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-xl text-xs"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => handleInsert(contextMenu.nodo, 'above')}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
            >
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Adicionar linha acima
            </button>
            <button
              onClick={() => handleInsert(contextMenu.nodo, 'below')}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
            >
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Adicionar linha abaixo
            </button>
            <button
              onClick={() => { setContextMenu(null); setAddingParentId(contextMenu.nodo.id) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-blue-50 text-blue-700"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Adicionar sub-item
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button
              onClick={() => { setContextMenu(null); handleMoveRow(contextMenu.nodo, 'up') }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
            >
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              Mover para cima
            </button>
            <button
              onClick={() => { setContextMenu(null); handleMoveRow(contextMenu.nodo, 'down') }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
            >
              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Mover para baixo
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button
              onClick={() => { setContextMenu(null); handleDelete(contextMenu.nodo.id) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-red-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Remover linha
            </button>
          </div>
        </>
      )}

      {addingParentId === 'root' && (
        <AddItemForm orcamentoId={orcamentoId} parentId={null} parentNivel={0} parentNumero=""
          planilhaId={activePlanilhaId}
          onClose={(newItem) => { if (newItem) handleAfterCreate(newItem); else setAddingParentId(undefined) }}
          isGroup={true} />
      )}

      {items.length === 0 && !addingParentId && (
        <button
          onClick={() => setAddingParentId('root')}
          className="w-full rounded-xl border-2 border-dashed border-gray-200 p-12 text-center hover:border-blue-300 hover:bg-blue-50/40 transition-colors group"
        >
          <svg className="w-10 h-10 mx-auto mb-3 text-gray-300 group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
          <p className="text-sm font-medium text-gray-500 group-hover:text-blue-600">Adicionar primeiro capítulo</p>
          <p className="text-xs text-gray-400 mt-1">Clique para começar ou importe um arquivo Excel</p>
        </button>
      )}

      {/* Tabela */}
      {items.length > 0 && (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(e: DragStartEvent) => { setDragActiveId(String(e.active.id)); dragDeltaX.current = 0 }}
        onDragMove={(e: DragMoveEvent) => { dragDeltaX.current = e.delta.x }}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragActiveId(null)}
      >
      <SortableContext items={visible.map(v => v.nodo.id)} strategy={verticalListSortingStrategy}>
      <div ref={scrollContainerRef} className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-16rem)] border border-gray-300 shadow-sm">
        <table className="w-full text-xs min-w-[700px] border-collapse">
          <thead className="sticky top-0 z-10 text-left">
            <tr className="bg-[#1a2e4a] text-white">
              <th className="px-2 py-2 w-6 border border-[#2d4a6e]" title="Arrastar" />
              <th className="px-2 py-2 w-8 text-center border border-[#2d4a6e] font-semibold">#</th>
              <th className="px-2 py-2 w-24 border border-[#2d4a6e] font-semibold">Item</th>
              <th className="px-2 py-2 w-24 border border-[#2d4a6e] font-semibold">Composição</th>
              <th className="px-2 py-2 border border-[#2d4a6e] font-semibold">Descrição completa</th>
              <th className="px-2 py-2 w-16 text-center border border-[#2d4a6e] font-semibold">Unidade</th>
              <th className="px-2 py-2 w-20 text-right border border-[#2d4a6e] font-semibold">Qtde.</th>
              <th className="px-2 py-2 w-28 text-right border border-[#2d4a6e] font-semibold">Custo Unitário</th>
              <th className="px-2 py-2 w-32 text-right border border-[#2d4a6e] font-semibold">Total Custo Unitário</th>
              <th className="px-2 py-2 w-16 text-right border border-[#2d4a6e] font-semibold">% BDI</th>
              <th className="px-2 py-2 w-16 text-right border border-[#2d4a6e] font-semibold">% Custo</th>
              <th className="px-2 py-2 w-10 text-center border border-[#2d4a6e] font-semibold">ABC</th>
              <th className="px-2 py-2 w-8 border border-[#2d4a6e]" />
            </tr>
          </thead>
          <tbody>
            {useVirtualRender && virtualPaddingTop > 0 && (
              <tr aria-hidden="true">
                <td colSpan={13} style={{ height: virtualPaddingTop, padding: 0, border: 'none' }} />
              </tr>
            )}
            {rowsToRender.map(({ nodo, depth, rowIdx }) => {
              const isGroup    = nodo.filhos.length > 0
              const isCollapsed = collapsed.has(nodo.id)
              const addingHere  = addingParentId === nodo.id
              const showFormAfter = nodo.id === formHostId
              const isDragging  = dragActiveId === nodo.id

              return (
                <Fragment key={nodo.id}>
                  <SortableRow
                    id={nodo.id}
                    className={`group transition-colors ${rowCls(depth, isGroup, rowIdx)} ${deletingId === nodo.id ? 'opacity-30' : ''} ${isDragging ? 'opacity-40' : ''} ${nodo.codigo && invalidCodigos.has(nodo.codigo) ? 'outline outline-2 outline-red-400 bg-red-50' : ''}`}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, nodo }) }}
                  >

                    {/* Contador */}
                    <td className="px-1 py-0.5 text-center text-gray-400 font-mono text-[10px] select-none border border-gray-200 w-8">
                      {rowIdx + 1}
                    </td>

                    {/* EAP / número (somente leitura — gerado automaticamente) */}
                    <td className="px-2 py-0.5 font-mono border border-gray-200">
                      <div className="flex items-center gap-1">
                        {isGroup ? (
                          <button onClick={() => toggleCollapse(nodo.id)}
                            className="shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded hover:bg-black/10 cursor-pointer transition-transform">
                            <svg className={`w-2.5 h-2.5 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        ) : (
                          <span className="shrink-0 w-3.5" />
                        )}
                        <span className="text-[11px] select-none text-gray-600 tabular-nums">{nodo.numero}</span>
                      </div>
                    </td>

                    {/* Composição (somente folhas) */}
                    <td className="px-2 py-0.5 font-mono text-[10px] border border-gray-200">
                      {!isGroup && (() => {
                        const editing = editingCell?.id === nodo.id && editingCell?.field === 'codigo'
                        if (editing) return (
                          <CodigoAutocomplete
                            autoFocus value={cellDraft} orcamentoId={orcamentoId}
                            className={INP}
                            onChange={v => setCellDraft(v)}
                            onKeyDown={e => handleKey(e, 'codigo')}
                            onBlur={handleBlur}
                            onSelect={s => {
                              skipBlur.current = true
                              const hasCusto = s.custo_unitario != null
                              const oldCodigo = nodo.codigo
                              if (oldCodigo) setInvalidCodigos(prev => { const ns = new Set(prev); ns.delete(oldCodigo); return ns })
                              setIsDirty(true)
                              const fields = {
                                codigo: s.codigo,
                                descricao: s.descricao,
                                unidade: s.unidade,
                                ...(hasCusto ? { custo_unitario: s.custo_unitario } : {}),
                              }
                              setItems(prev => prev.map(it => it.id === nodo.id ? { ...it, ...fields } : it))
                              dirtyItemsRef.current.set(nodo.id, { ...dirtyItemsRef.current.get(nodo.id), ...fields })
                              setEditingCell(null)
                            }}
                          />
                        )
                        const isInvalid = !!nodo.codigo && invalidCodigos.has(nodo.codigo)
                        return (
                          <div className="relative group/code">
                            <div onClick={() => openCell(nodo.id, 'codigo')} className={`${CELL_HOVER} ${isInvalid ? 'text-red-600 font-semibold' : ''}`}>
                              {nodo.codigo ?? <span className="text-gray-400">—</span>}
                              {isInvalid && (
                                <svg className="inline-block ml-1 w-3 h-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                            </div>
                            {isInvalid && (
                              <div className="absolute left-0 top-full mt-1 z-50 whitespace-nowrap rounded bg-red-700 px-2 py-1 text-[10px] text-white shadow-lg opacity-0 group-hover/code:opacity-100 transition-opacity pointer-events-none">
                                Composição não encontrada.
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </td>

                    {/* Descrição completa */}
                    <td className="px-2 py-0.5 border border-gray-200">
                      {(() => {
                        const editing = editingCell?.id === nodo.id && editingCell?.field === 'descricao'
                        if (editing) return (
                          <input autoFocus value={cellDraft} onChange={e => setCellDraft(e.target.value)}
                            onKeyDown={e => handleKey(e, 'descricao')} onBlur={handleBlur}
                            className={INP} />
                        )
                        return (
                          <div onClick={() => openCell(nodo.id, 'descricao')} className={`${CELL_HOVER} truncate max-w-xs`} title={nodo.descricao}>
                            {nodo.descricao}
                          </div>
                        )
                      })()}
                    </td>

                    {/* Unidade (só folhas) */}
                    <td className="px-2 py-0.5 text-center border border-gray-200">
                      {!isGroup && textCell(nodo, 'unidade', <span>{nodo.unidade ?? ''}</span>, 'text-center w-14')}
                    </td>

                    {/* Qtde. (só folhas) */}
                    <td className="px-2 py-0.5 text-right border border-gray-200">
                      {!isGroup && numCell(nodo, 'quantidade',
                        nodo.quantidade != null && nodo.quantidade > 0
                          ? <span className="tabular-nums">{nodo.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</span>
                          : <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Custo Unitário (só folhas) */}
                    <td className="px-2 py-0.5 text-right border border-gray-200">
                      {!isGroup && numCell(nodo, 'custo_unitario',
                        nodo.custo_unitario != null && nodo.custo_unitario > 0
                          ? <span className="tabular-nums">{BRL(nodo.custo_unitario)}</span>
                          : <span className="text-gray-300">—</span>
                      )}
                    </td>

                    {/* Total Custo Unitário */}
                    <td className="px-2 py-0.5 text-right tabular-nums border border-gray-200">
                      {nodo.total > 0
                        ? <span className="font-semibold text-gray-900">{BRL(nodo.total)}</span>
                        : <span className="text-gray-300">0</span>}
                    </td>

                    {/* % BDI (só folhas) */}
                    <td className="px-2 py-0.5 text-right tabular-nums border border-gray-200">
                      {!isGroup && (() => {
                        const editing = editingCell?.id === nodo.id && editingCell?.field === 'bdi_especifico'
                        const bdiEfetivo = nodo.bdi_especifico ?? bdiGlobal
                        const isGlobal = nodo.bdi_especifico == null
                        if (editing) return (
                          <input
                            autoFocus type="number" step="any" min="0" value={cellDraft}
                            onChange={e => setCellDraft(e.target.value)}
                            onKeyDown={e => handleKey(e, 'bdi_especifico')}
                            onBlur={handleBlur}
                            className={`${INP} text-right`}
                            placeholder={String(bdiGlobal)}
                          />
                        )
                        return (
                          <div
                            onClick={() => openCell(nodo.id, 'bdi_especifico')}
                            className={`${CELL_HOVER} text-right`}
                            title={isGlobal ? 'BDI global — clique para definir BDI específico' : 'BDI específico'}
                          >
                            <span className={isGlobal ? 'text-gray-400' : 'font-semibold text-blue-700'}>{bdiEfetivo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        )
                      })()}
                    </td>

                    {/* % Custo e Classe ABC — apenas folhas */}
                    {(() => {
                      const abc = !isGroup ? abcMap.get(nodo.id) : undefined
                      const pct = !isGroup && grandTotal > 0 ? (nodo.total / grandTotal) * 100 : 0
                      const CLS: Record<AbcClasse, string> = {
                        A: 'bg-red-100 text-red-700 font-bold',
                        B: 'bg-amber-100 text-amber-700 font-bold',
                        C: 'bg-green-100 text-green-700 font-bold',
                      }
                      return (
                        <>
                          <td className="px-2 py-0.5 text-right tabular-nums border border-gray-200 text-gray-500">
                            {!isGroup && nodo.total > 0 ? `${pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : null}
                          </td>
                          <td className="px-1 py-0.5 text-center border border-gray-200">
                            {abc ? <span className={`inline-block px-1.5 rounded text-[10px] ${CLS[abc.classe]}`}>{abc.classe}</span> : null}
                          </td>
                        </>
                      )
                    })()}

                    {/* Ações — visíveis só no hover */}
                    <td className="px-1 py-0.5 border border-gray-200">
                      <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setAddingParentId(addingHere ? undefined : nodo.id)}
                          title="Adicionar sub-item"
                          className="rounded p-0.5 hover:bg-black/10 transition-colors">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                        <button onClick={() => handleMoveRow(nodo, 'up')} title="Mover para cima"
                          className="rounded p-0.5 hover:bg-black/10 transition-colors">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button onClick={() => handleMoveRow(nodo, 'down')} title="Mover para baixo"
                          className="rounded p-0.5 hover:bg-black/10 transition-colors">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(nodo.id)} title="Remover"
                          className="rounded p-0.5 hover:bg-red-500/20 hover:text-red-600 transition-colors">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </SortableRow>

                  {viewMode === 'analitica' && !isGroup && nodo.codigo && (
                    analiticaInsumos.get(nodo.codigo)?.map((ins, i) => (
                      <tr key={`${nodo.id}-ins-${i}`} className="bg-white text-gray-500">
                        <td className="px-1 py-px border border-gray-100 text-[10px] text-center text-gray-300 font-mono" />
                        <td className="px-2 py-px border border-gray-100" />
                        <td className="px-2 py-px border border-gray-100 font-mono text-[10px] text-blue-500">{ins.codigo}</td>
                        <td className="px-2 py-px border border-gray-100 text-[10px] pl-6 text-gray-500">{ins.descricao}</td>
                        <td className="px-2 py-px border border-gray-100 text-[10px] text-center">{ins.unidade}</td>
                        <td className="px-2 py-px border border-gray-100 text-[10px] text-right tabular-nums">
                          {ins.indice.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                        </td>
                        <td className="px-2 py-px border border-gray-100 text-[10px] text-right tabular-nums">
                          {ins.origem === 'orcamento' && editingInsumoCodigo === ins.codigo ? (
                            <input
                              autoFocus
                              type="number"
                              min="0"
                              step="any"
                              defaultValue={ins.custo}
                              onBlur={e => handleSalvarCustoInsumo(ins.codigo, ins.descricao, ins.unidade, ins.custo, e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); handleSalvarCustoInsumo(ins.codigo, ins.descricao, ins.unidade, ins.custo, (e.target as HTMLInputElement).value) }
                                if (e.key === 'Escape') { e.preventDefault(); setEditingInsumoCodigo(null) }
                              }}
                              className="block w-full text-right rounded border border-blue-400 bg-white px-1 py-0 text-[10px] outline-none ring-2 ring-blue-400/20 tabular-nums"
                            />
                          ) : (
                            <span
                              onClick={() => ins.origem === 'orcamento' && setEditingInsumoCodigo(ins.codigo)}
                              className={ins.origem === 'orcamento' ? 'cursor-pointer hover:underline decoration-dotted' : ''}
                              title={ins.origem === 'orcamento' ? 'Clique para editar' : undefined}
                            >
                              {salvandoInsumoCodigo === ins.codigo ? '…' : BRL(ins.custo)}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-px border border-gray-100 text-[10px] text-right tabular-nums">{BRL(ins.indice * ins.custo)}</td>
                        <td colSpan={4} className="border border-gray-100" />
                      </tr>
                    ))
                  )}

                  {showFormAfter && addingParentGroup && (
                    <tr>
                      <td colSpan={12} className="px-2 py-1.5">
                        <AddItemForm orcamentoId={orcamentoId}
                          parentId={addingParentGroup.id} parentNivel={addingParentGroup.nivel}
                          parentNumero={addingParentGroup.numero} parentDescricao={addingParentGroup.descricao}
                          planilhaId={activePlanilhaId}
                          onClose={(newItem) => { if (newItem) handleAfterCreate(newItem); else setAddingParentId(undefined) }}
                          isGroup={false} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {useVirtualRender && virtualPaddingBottom > 0 && (
              <tr aria-hidden="true">
                <td colSpan={13} style={{ height: virtualPaddingBottom, padding: 0, border: 'none' }} />
              </tr>
            )}

            <tr className="bg-[#1a2e4a] text-white">
              <td colSpan={8} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-widest text-slate-300 border border-[#2d4a6e]">
                Total Geral
              </td>
              <td className="px-3 py-2 text-right text-sm font-bold tabular-nums border border-[#2d4a6e]">
                {BRL(grandTotal)}
              </td>
              <td colSpan={4} className="border border-[#2d4a6e]" />
            </tr>
          </tbody>
        </table>
      </div>
      <DragOverlay>
        {dragActiveId && (() => {
          const entry = flat.find(f => f.nodo.id === dragActiveId)
          if (!entry) return null
          return (
            <div className="bg-white border border-blue-400 shadow-xl rounded px-3 py-1.5 text-xs font-medium text-gray-800 opacity-90">
              {entry.nodo.numero} — {entry.nodo.descricao}
            </div>
          )
        })()}
      </DragOverlay>
      </SortableContext>
      </DndContext>
      )}

      {/* Modal: relatório de consistência */}
      {consistenciaReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-xl overflow-hidden">
            <div className={`px-5 py-4 ${consistenciaReport.ok ? 'bg-green-500' : 'bg-amber-500'}`}>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                {consistenciaReport.ok ? '✓ Projeto consistente' : 'Problemas encontrados'}
              </h2>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
              {consistenciaReport.ok && (
                <p className="text-sm text-gray-600">Nenhum problema detectado. O projeto está em ordem.</p>
              )}
              {consistenciaReport.referenciasQuebradas.length > 0 && (
                <section>
                  <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-2">
                    Referências quebradas ({consistenciaReport.referenciasQuebradas.length})
                  </p>
                  <ul className="space-y-1">
                    {consistenciaReport.referenciasQuebradas.map(r => (
                      <li key={r.itemId} className="text-xs text-gray-700 flex gap-2 bg-red-50 px-3 py-1.5 rounded">
                        <span className="font-mono text-red-500 shrink-0">{r.numero}</span>
                        <span className="truncate">{r.descricao}</span>
                        <span className="font-mono text-red-400 shrink-0">cod: {r.codigo}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {consistenciaReport.composicoesVazias.length > 0 && (
                <section>
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">
                    Composições sem insumos ({consistenciaReport.composicoesVazias.length})
                  </p>
                  <ul className="space-y-1">
                    {consistenciaReport.composicoesVazias.map(c => (
                      <li key={c.id} className="text-xs text-gray-700 flex gap-2 bg-amber-50 px-3 py-1.5 rounded">
                        <span className="font-mono text-amber-500 shrink-0">{c.codigo}</span>
                        <span className="truncate">{c.descricao}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {consistenciaReport.composicoesOrfas.length > 0 && (
                <section>
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2">
                    Composições órfãs ({consistenciaReport.composicoesOrfas.length})
                    <span className="ml-1 font-normal text-blue-500">— não referenciadas na planilha</span>
                  </p>
                  <ul className="space-y-1">
                    {consistenciaReport.composicoesOrfas.map(c => (
                      <li key={c.id} className="text-xs text-gray-700 flex gap-2 bg-blue-50 px-3 py-1.5 rounded">
                        <span className="font-mono text-blue-500 shrink-0">{c.codigo}</span>
                        <span className="truncate">{c.descricao}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {consistenciaReport.valoresInvalidos.length > 0 && (
                <section>
                  <p className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-2">
                    Valores inválidos ({consistenciaReport.valoresInvalidos.length})
                  </p>
                  <ul className="space-y-1">
                    {consistenciaReport.valoresInvalidos.map((v, i) => (
                      <li key={i} className="text-xs text-gray-700 flex gap-2 bg-orange-50 px-3 py-1.5 rounded">
                        <span className="font-mono text-orange-500 shrink-0">{v.numero}</span>
                        <span className="truncate">{v.descricao}</span>
                        <span className="text-orange-400 shrink-0">— {v.problema}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
              <button
                onClick={() => setConsistenciaReport(null)}
                className="rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar limpeza de órfãos */}
      {confirmarLimpeza && orfaosDetectados && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900">Limpar composições órfãs</h2>
            <p className="mt-2 text-sm text-gray-600">
              As composições abaixo não estão em nenhuma planilha deste projeto.
              Elas serão marcadas como removidas (soft delete) e não aparecerão mais nas importações e cálculos.
            </p>

            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 max-h-48 overflow-y-auto">
              <ul className="divide-y divide-gray-100">
                {orfaosDetectados.composicoes.map(c => (
                  <li key={c.id} className="px-3 py-2 text-xs text-gray-700">
                    <span className="font-mono text-gray-500 mr-2">{c.codigo}</span>
                    {c.descricao}
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-3 text-xs text-gray-400">
              {orfaosDetectados.composicoes.length} composição(ões) e {orfaosDetectados.insumos} insumo(s) serão removidos.
            </p>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => { setConfirmarLimpeza(false); setOrfaosDetectados(null) }}
                disabled={limpandoOrfaos}
                className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Manter
              </button>
              <button
                onClick={handleLimparOrfaos}
                disabled={limpandoOrfaos}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40"
              >
                {limpandoOrfaos ? 'Removendo…' : 'Remover órfãos'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
