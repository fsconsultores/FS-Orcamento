'use client'

import { useState, useRef, useEffect, Fragment } from 'react'
import { atualizarItemEstrutura, deletarItemEstrutura, adicionarItemEstrutura, adicionarItemNaPosicao, limparPlanilha, buscarSugestoesCodigo } from './planilha-action'
import type { SugestaoCodigo, EstruturaItem } from './planilha-action'

export type { EstruturaItem }

interface Nodo extends EstruturaItem {
  filhos: Nodo[]
  total: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildTree(items: EstruturaItem[]): Nodo[] {
  const map = new Map<string, Nodo>()
  for (const item of items) map.set(item.id, { ...item, filhos: [], total: 0 })
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

function calcTotais(nodo: Nodo): number {
  if (nodo.tipo === 'item') nodo.total = (nodo.quantidade ?? 0) * (nodo.custo_unitario ?? 0)
  else nodo.total = nodo.filhos.reduce((s, f) => s + calcTotais(f), 0)
  return nodo.total
}

function flattenTree(nodos: Nodo[], depth = 0): { nodo: Nodo; depth: number }[] {
  return nodos.flatMap(n => [{ nodo: n, depth }, ...flattenTree(n.filhos, depth + 1)])
}

const BRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const ROW_BG: Record<number, string> = {
  0: 'bg-slate-800 text-white',
  1: 'bg-blue-50 text-blue-950',
  2: 'bg-slate-50 text-slate-800',
  3: 'bg-white text-gray-700',
}
const ROW_HOVER: Record<number, string> = {
  0: 'hover:bg-slate-700',
  1: 'hover:bg-blue-100',
  2: 'hover:bg-slate-100',
  3: 'hover:bg-blue-50/60',
}
const ROW_WEIGHT: Record<number, string> = {
  0: 'font-bold',
  1: 'font-semibold',
  2: 'font-medium',
  3: 'font-normal',
}
function rowCls(depth: number) {
  const d = Math.min(depth, 3)
  return `${ROW_BG[d]} ${ROW_HOVER[d]} ${ROW_WEIGHT[d]}`
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

  useEffect(() => {
    if (aberto && inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setDropPos({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 320) })
    }
  }, [aberto, sugestoes.length])

  // Busca ao montar (abre sugestões imediatamente)
  useEffect(() => {
    buscarSugestoesCodigo(orcamentoId, value).then(res => {
      setSugestoes(res)
      setAberto(res.length > 0)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleChange(v: string) {
    onChange(v)
    setCursor(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const res = await buscarSugestoesCodigo(orcamentoId, v)
      setSugestoes(res)
      setAberto(res.length > 0)
    }, 220)
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
  orcamentoId, parentId, parentNivel, parentNumero, parentDescricao, onClose,
}: {
  orcamentoId: string
  parentId: string | null
  parentNivel: number
  parentNumero: string
  parentDescricao?: string
  onClose: (newItem?: EstruturaItem) => void
}) {
  const [tipo, setTipo] = useState<'item' | 'grupo'>('item')
  const [form, setForm] = useState({ numero: '', codigo: '', descricao: '', unidade: '', quantidade: '', custo_unitario: '' })
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const newItem = await adicionarItemEstrutura(orcamentoId, parentId, parentNivel, {
        numero: form.numero || `${parentNumero}.?`,
        codigo: tipo === 'grupo' ? null : (form.codigo || null),
        descricao: form.descricao,
        unidade: tipo === 'grupo' ? null : (form.unidade || null),
        quantidade: tipo === 'grupo' ? null : (parseFloat(form.quantidade.replace(',', '.')) || null),
        custo_unitario: tipo === 'grupo' ? null : (parseFloat(form.custo_unitario.replace(',', '.')) || null),
        tipo,
      })
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
        <div>
          <label className="block text-gray-500 mb-0.5">Tipo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value as any)} className={`${inp} w-24`}>
            <option value="item">Item</option>
            <option value="grupo">Grupo</option>
          </select>
        </div>
        <div>
          <label className="block text-gray-500 mb-0.5">Nº Item</label>
          <input value={form.numero} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))}
            placeholder={`${parentNumero}.01`} className={`${inp} w-24`} />
        </div>
        {tipo === 'item' && (
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
          <input required value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} className={inp} />
        </div>
        {tipo === 'item' && (
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

const ITEM_FIELDS  = ['numero', 'codigo', 'descricao', 'unidade', 'quantidade', 'custo_unitario'] as const
const GRUPO_FIELDS = ['numero', 'descricao'] as const

function editableFields(tipo: 'item' | 'grupo'): readonly string[] {
  return tipo === 'item' ? ITEM_FIELDS : GRUPO_FIELDS
}

function fieldToStr(it: EstruturaItem, field: string): string {
  const v = (it as any)[field]
  return v != null ? String(v) : ''
}

// ─── View principal ───────────────────────────────────────────────────────────

export function PlanilhaView({ initialItems, orcamentoId, nomeOrcamento }: { initialItems: EstruturaItem[]; orcamentoId: string; nomeOrcamento?: string }) {
  const [items, setItems]               = useState<EstruturaItem[]>(initialItems)
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [addingParentId, setAddingParentId] = useState<string | null | 'root'>()
  const [collapsed, setCollapsed]       = useState<Set<string>>(new Set())
  const [editingCell, setEditingCell]   = useState<{ id: string; field: string } | null>(null)
  const [cellDraft, setCellDraft]       = useState('')
  const [contextMenu, setContextMenu]   = useState<{ x: number; y: number; nodo: Nodo } | null>(null)
  const skipBlur                        = useRef(false)

  // Rebuild tree
  const tree = buildTree(items)
  for (const n of tree) calcTotais(n)
  const grandTotal = tree.reduce((s, n) => s + n.total, 0)
  const flat = flattenTree(tree)

  const visible = flat.filter(({ nodo }) => {
    let pid = nodo.parent_id
    while (pid) {
      if (collapsed.has(pid)) return false
      pid = items.find(i => i.id === pid)?.parent_id ?? null
    }
    return true
  })

  let formHostId: string | null = null
  if (addingParentId && addingParentId !== 'root') {
    for (const { nodo } of visible) {
      if (nodo.id === addingParentId) { formHostId = nodo.id; continue }
      let pid = nodo.parent_id
      while (pid) {
        if (pid === addingParentId) { formHostId = nodo.id; break }
        pid = items.find(i => i.id === pid)?.parent_id ?? null
      }
    }
  }
  const addingParentGroup = addingParentId && addingParentId !== 'root'
    ? items.find(i => i.id === addingParentId) ?? null
    : null

  function toggleCollapse(id: string) {
    setCollapsed(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  // ── Inline editing ──────────────────────────────────────────────────────────

  function openCell(id: string, field: string) {
    const it = items.find(i => i.id === id)
    if (!it || !editableFields(it.tipo).includes(field)) return
    setEditingCell({ id, field })
    setCellDraft(fieldToStr(it, field))
  }

  function saveField(id: string, field: string, draft: string) {
    let value: any
    if (field === 'quantidade' || field === 'custo_unitario') {
      const n = parseFloat(draft.replace(',', '.'))
      value = isNaN(n) ? null : n
    } else {
      value = draft.trim() || null
    }
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it))
    atualizarItemEstrutura(id, orcamentoId, { [field]: value } as any)
  }

  function navigateFrom(id: string, field: string, dir: 'tab' | 'back' | 'enter') {
    const it = items.find(i => i.id === id)
    if (!it) { setEditingCell(null); return }
    const fields = editableFields(it.tipo)
    const colIdx = fields.indexOf(field)
    const rowIdx = visible.findIndex(v => v.nodo.id === id)

    if (dir === 'tab') {
      if (colIdx < fields.length - 1) { openCell(id, fields[colIdx + 1]); return }
      for (let i = rowIdx + 1; i < visible.length; i++) {
        const f = editableFields(visible[i].nodo.tipo)
        if (f.length) { openCell(visible[i].nodo.id, f[0]); return }
      }
    } else if (dir === 'back') {
      if (colIdx > 0) { openCell(id, fields[colIdx - 1]); return }
      for (let i = rowIdx - 1; i >= 0; i--) {
        const f = editableFields(visible[i].nodo.tipo)
        if (f.length) { openCell(visible[i].nodo.id, f[f.length - 1]); return }
      }
    } else if (dir === 'enter') {
      for (let i = rowIdx + 1; i < visible.length; i++) {
        if (editableFields(visible[i].nodo.tipo).includes(field)) { openCell(visible[i].nodo.id, field); return }
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
    setContextMenu(null)
    const newItem = await adicionarItemNaPosicao(orcamentoId, nodo.id, position)
    setItems(prev => {
      const next = [...prev, newItem]
      // Reflecte a mudança de ordem dos irmãos localmente
      return next.map(it => {
        if (it.id === newItem.id) return it
        const sameParent = it.parent_id === nodo.parent_id
        const needsShift = position === 'above'
          ? sameParent && it.ordem >= nodo.ordem && it.id !== newItem.id
          : sameParent && it.ordem > nodo.ordem && it.id !== newItem.id
        return needsShift ? { ...it, ordem: it.ordem + 1 } : it
      })
    })
    // Abre a célula "numero" do novo item para edição imediata
    setTimeout(() => openCell(newItem.id, 'numero'), 50)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este item e todos seus sub-itens?')) return
    setDeletingId(id)
    const toRemove = new Set<string>()
    function collect(itemId: string) {
      toRemove.add(itemId)
      for (const it of items) if (it.parent_id === itemId) collect(it.id)
    }
    collect(id)
    setItems(prev => prev.filter(it => !toRemove.has(it.id)))
    await deletarItemEstrutura(id, orcamentoId)
    setDeletingId(null)
  }

  async function handleExport() {
    const XS = await import('xlsx-js-style')

    // Paleta de cores (sem #)
    const C = {
      slate800: '1e293b', slate700: '334155', slate50: 'f8fafc',
      blue50: 'eff6ff', blue950: '172554',
      white: 'ffffff', gray700: '374151',
      headerBg: 'f1f5f9', headerFg: '64748b',
      border: 'e2e8f0', borderDark: '475569',
    }

    function cellStyle(depth: number, col: number) {
      const isNum = col >= 4
      let bg: string, fg: string, bold: boolean, sz: number
      if (depth === -1) { bg = C.headerBg; fg = C.headerFg; bold = true; sz = 9 }
      else if (depth === 0) { bg = C.slate800; fg = C.white; bold = true; sz = 10 }
      else if (depth === 1) { bg = C.blue50; fg = C.blue950; bold = true; sz = 9 }
      else if (depth === 2) { bg = C.slate50; fg = C.slate700; bold = false; sz = 9 }
      else { bg = C.white; fg = C.gray700; bold = false; sz = 9 }

      return {
        fill: { patternType: 'solid', fgColor: { rgb: bg } },
        font: { name: 'Calibri', sz, bold, color: { rgb: fg } },
        alignment: { horizontal: isNum ? 'right' : 'left', vertical: 'center', wrapText: col === 2 },
        border: {
          top:    { style: 'thin', color: { rgb: depth <= 0 ? C.borderDark : C.border } },
          bottom: { style: 'thin', color: { rgb: depth <= 0 ? C.borderDark : C.border } },
          left:   { style: 'thin', color: { rgb: C.border } },
          right:  { style: 'thin', color: { rgb: C.border } },
        },
      }
    }

    const headers = ['Item', 'Código', 'Descrição', 'Und', 'Qtde', 'R$ Unit.', 'R$ Total']
    const depths: number[] = [-1]
    const aoa: any[][] = [headers]

    for (const { nodo, depth } of flat) {
      const isItem = nodo.tipo === 'item'
      const total = isItem ? (nodo.quantidade ?? 0) * (nodo.custo_unitario ?? 0) : nodo.total
      aoa.push([
        nodo.numero,
        nodo.codigo ?? '',
        '  '.repeat(depth) + nodo.descricao,
        nodo.unidade ?? '',
        isItem ? (nodo.quantidade ?? null) : null,
        isItem ? (nodo.custo_unitario ?? null) : null,
        total > 0 ? total : null,
      ])
      depths.push(depth)
    }

    // Linha de total geral
    aoa.push(['', '', 'TOTAL GERAL', '', '', '', grandTotal])
    depths.push(-2)

    const ws = XS.utils.aoa_to_sheet(aoa)

    // Aplica estilos célula a célula
    for (let r = 0; r < aoa.length; r++) {
      const depth = depths[r]
      for (let c = 0; c < headers.length; c++) {
        const ref = XS.utils.encode_cell({ r, c })
        if (!ws[ref]) ws[ref] = { v: '', t: 's' }

        // Linha de total geral
        if (depth === -2) {
          ws[ref].s = {
            fill: { patternType: 'solid', fgColor: { rgb: C.slate800 } },
            font: { name: 'Calibri', sz: 10, bold: true, color: { rgb: c === 2 ? C.headerFg : C.white } },
            alignment: { horizontal: c >= 4 ? 'right' : c === 2 ? 'right' : 'left', vertical: 'center' },
            border: { top: { style: 'medium', color: { rgb: C.slate700 } } },
          }
        } else {
          ws[ref].s = cellStyle(depth, c)
        }

        // Formatos numéricos
        if (c === 5 || c === 6) { // R$ Unit. e R$ Total
          if (ws[ref].v != null && ws[ref].v !== '') {
            ws[ref].t = 'n'
            ws[ref].z = '#,##0.00'
          }
        } else if (c === 4) { // Qtde — sem formato customizado para evitar vírgula residual
          if (ws[ref].v != null && ws[ref].v !== '') {
            ws[ref].t = 'n'
          }
        }
      }
    }

    ws['!cols'] = [
      { wch: 10 }, { wch: 13 }, { wch: 52 },
      { wch: 6  }, { wch: 12 }, { wch: 15 }, { wch: 16 },
    ]
    ws['!rows'] = depths.map(d =>
      ({ hpt: d === -1 || d === -2 ? 20 : d === 0 ? 18 : 15 })
    )

    const wb = XS.utils.book_new()
    XS.utils.book_append_sheet(wb, ws, 'Planilha')
    const slug = (nomeOrcamento ?? 'planilha').replace(/[/\\?%*:|"<>]/g, '-').trim()
    XS.writeFile(wb, `${slug}.xlsx`)
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
              await limparPlanilha(orcamentoId)
              setItems([])
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
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Total Geral</p>
            <p className="text-lg font-bold text-gray-900 tabular-nums">{BRL(grandTotal)}</p>
          </div>
          <button onClick={handleExport}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar XLSX
          </button>
        </div>
      </div>

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
          onClose={(newItem) => { if (newItem) setItems(prev => [...prev, newItem]); setAddingParentId(undefined) }} />
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
      {items.length > 0 && <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-16rem)] rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-xs min-w-[700px]">
          <thead className="sticky top-0 z-10 bg-white border-b-2 border-gray-100 text-left">
            <tr>
              <th className="px-3 py-2.5 w-28 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Item</th>
              <th className="px-3 py-2.5 w-24 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Código</th>
              <th className="px-3 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Descrição</th>
              <th className="px-3 py-2.5 w-14 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-center">Und</th>
              <th className="px-3 py-2.5 w-24 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">Qtde</th>
              <th className="px-3 py-2.5 w-28 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">R$ Unit.</th>
              <th className="px-3 py-2.5 w-32 text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-right">R$ Total</th>
              <th className="px-3 py-2.5 w-10" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ nodo, depth }) => {
              const isGroup    = nodo.tipo === 'grupo'
              const hasFilhos  = nodo.filhos.length > 0
              const isCollapsed = collapsed.has(nodo.id)
              const addingHere  = addingParentId === nodo.id
              const showFormAfter = nodo.id === formHostId

              return (
                <Fragment key={nodo.id}>
                  <tr
                    className={`group border-b border-gray-100/80 transition-colors ${rowCls(depth)} ${deletingId === nodo.id ? 'opacity-30' : ''}`}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, nodo }) }}
                  >

                    {/* Item / número */}
                    <td className="py-2 font-mono" style={{ paddingLeft: `${10 + depth * 16}px`, paddingRight: '8px' }}>
                      <div className="flex items-center gap-1">
                        {isGroup ? (
                          <button onClick={() => hasFilhos && toggleCollapse(nodo.id)}
                            className={`shrink-0 w-4 h-4 flex items-center justify-center rounded transition-transform ${hasFilhos ? 'hover:bg-black/10 cursor-pointer' : 'invisible'}`}>
                            <svg className={`w-3 h-3 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        ) : (
                          <span className="shrink-0 w-4 h-4 flex items-center justify-center opacity-30">
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 8 8">
                              <circle cx="4" cy="4" r="2" />
                            </svg>
                          </span>
                        )}
                        <div className="flex-1">
                          {textCell(nodo, 'numero', <span>{nodo.numero}</span>, 'font-mono')}
                        </div>
                      </div>
                    </td>

                    {/* Código */}
                    <td className="px-3 py-2 font-mono text-[10px]">
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
                              setItems(prev => prev.map(it => it.id === nodo.id ? {
                                ...it,
                                codigo: s.codigo,
                                descricao: s.descricao,
                                unidade: s.unidade,
                                ...(hasCusto ? { custo_unitario: s.custo_unitario } : {}),
                              } : it))
                              atualizarItemEstrutura(nodo.id, orcamentoId, {
                                codigo: s.codigo,
                                descricao: s.descricao,
                                unidade: s.unidade,
                                ...(hasCusto ? { custo_unitario: s.custo_unitario } : {}),
                              })
                              setEditingCell(null)
                            }}
                          />
                        )
                        return (
                          <div onClick={() => openCell(nodo.id, 'codigo')} className={CELL_HOVER}>
                            {nodo.codigo ?? <span className="text-gray-400">—</span>}
                          </div>
                        )
                      })()}
                    </td>

                    {/* Descrição */}
                    <td className="px-3 py-2 max-w-xs">
                      {(() => {
                        const editing = editingCell?.id === nodo.id && editingCell?.field === 'descricao'
                        if (editing) return (
                          <input autoFocus value={cellDraft} onChange={e => setCellDraft(e.target.value)}
                            onKeyDown={e => handleKey(e, 'descricao')} onBlur={handleBlur}
                            className={INP} />
                        )
                        return (
                          <div onClick={() => openCell(nodo.id, 'descricao')} className={`${CELL_HOVER} line-clamp-2`} title={nodo.descricao}>
                            {nodo.descricao}
                          </div>
                        )
                      })()}
                    </td>

                    {/* Unidade */}
                    <td className="px-3 py-2 text-center opacity-70">
                      {!isGroup && textCell(nodo, 'unidade',
                        <span>{nodo.unidade ?? <span className="opacity-30">—</span>}</span>,
                        'text-center w-14'
                      )}
                    </td>

                    {/* Quantidade */}
                    <td className="px-3 py-2 w-24">
                      {!isGroup && numCell(nodo, 'quantidade',
                        nodo.quantidade != null && nodo.quantidade > 0
                          ? <span className="tabular-nums">{nodo.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</span>
                          : <span className="opacity-25">—</span>
                      )}
                    </td>

                    {/* R$ Unit. */}
                    <td className="px-3 py-2 w-28">
                      {!isGroup && numCell(nodo, 'custo_unitario',
                        nodo.custo_unitario != null && nodo.custo_unitario > 0
                          ? <span className="tabular-nums">{BRL(nodo.custo_unitario)}</span>
                          : <span className="opacity-25">—</span>
                      )}
                    </td>

                    {/* R$ Total */}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {nodo.total > 0
                        ? <span className={`font-semibold ${depth === 0 ? 'text-white' : 'text-gray-900'}`}>{BRL(nodo.total)}</span>
                        : <span className="opacity-25">—</span>}
                    </td>

                    {/* Ações — visíveis só no hover */}
                    <td className="px-1 py-2">
                      <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isGroup && (
                          <button onClick={() => setAddingParentId(addingHere ? undefined : nodo.id)}
                            title="Adicionar sub-item"
                            className="rounded p-1 hover:bg-black/10 transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        )}
                        <button onClick={() => handleDelete(nodo.id)} title="Remover"
                          className="rounded p-1 hover:bg-red-500/20 hover:text-red-600 transition-colors">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>

                  {showFormAfter && addingParentGroup && (
                    <tr>
                      <td colSpan={8} className="px-2 py-1.5">
                        <AddItemForm orcamentoId={orcamentoId}
                          parentId={addingParentGroup.id} parentNivel={addingParentGroup.nivel}
                          parentNumero={addingParentGroup.numero} parentDescricao={addingParentGroup.descricao}
                          onClose={(newItem) => { if (newItem) setItems(prev => [...prev, newItem]); setAddingParentId(undefined) }} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}

            <tr className="bg-gradient-to-r from-slate-800 to-slate-700 text-white">
              <td colSpan={6} className="px-4 py-4 text-right text-xs font-semibold uppercase tracking-widest text-slate-300">
                Total Geral
              </td>
              <td className="px-3 py-4 text-right text-base font-bold tabular-nums">
                {BRL(grandTotal)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>}
    </div>
  )
}
