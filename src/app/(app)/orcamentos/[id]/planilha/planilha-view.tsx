'use client'

import { useState, useCallback, useRef, Fragment } from 'react'
import { atualizarItemEstrutura, deletarItemEstrutura, adicionarItemEstrutura, buscarSugestoesCodigo } from './planilha-action'
import type { SugestaoCodigo, EstruturaItem } from './planilha-action'

export type { EstruturaItem }

interface Nodo extends EstruturaItem {
  filhos: Nodo[]
  total: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildTree(items: EstruturaItem[]): Nodo[] {
  const map = new Map<string, Nodo>()
  for (const item of items) {
    map.set(item.id, { ...item, filhos: [], total: 0 })
  }
  const roots: Nodo[] = []
  for (const nodo of map.values()) {
    if (nodo.parent_id && map.has(nodo.parent_id)) {
      map.get(nodo.parent_id)!.filhos.push(nodo)
    } else {
      roots.push(nodo)
    }
  }
  // Ordena filhos por ordem
  function sort(nodes: Nodo[]) {
    nodes.sort((a, b) => a.ordem - b.ordem)
    for (const n of nodes) sort(n.filhos)
  }
  sort(roots)
  return roots
}

function calcTotais(nodo: Nodo): number {
  if (nodo.tipo === 'item') {
    nodo.total = (nodo.quantidade ?? 0) * (nodo.custo_unitario ?? 0)
  } else {
    nodo.total = nodo.filhos.reduce((s, f) => s + calcTotais(f), 0)
  }
  return nodo.total
}

function flattenTree(nodos: Nodo[], depth = 0): { nodo: Nodo; depth: number }[] {
  return nodos.flatMap(n => [
    { nodo: n, depth },
    ...flattenTree(n.filhos, depth + 1),
  ])
}

const BRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Paleta de cores por profundidade
const ROW_STYLE: Record<number, string> = {
  0: 'bg-gray-800 text-white font-bold',
  1: 'bg-gray-200 text-gray-800 font-semibold',
  2: 'bg-gray-100 text-gray-800 font-medium',
  3: 'bg-white text-gray-700',
}
function rowStyle(depth: number): string {
  return ROW_STYLE[Math.min(depth, 3)]
}

// ─── Célula editável ──────────────────────────────────────────────────────────

function EditableCell({
  value,
  type,
  onSave,
  className = '',
}: {
  value: number | null
  type: 'number' | 'currency'
  onSave: (v: number) => void
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function startEdit() {
    setDraft(String(value ?? 0).replace('.', ','))
    setEditing(true)
  }

  function commit() {
    const parsed = parseFloat(draft.replace(',', '.'))
    if (!isNaN(parsed) && parsed >= 0) onSave(parsed)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min="0"
        step="any"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className={`w-full text-right border border-blue-400 rounded px-1 py-0.5 text-xs focus:outline-none bg-white text-gray-900 ${className}`}
      />
    )
  }

  return (
    <button
      onClick={startEdit}
      title="Clique para editar"
      className={`block w-full text-right tabular-nums hover:underline hover:text-blue-700 ${className}`}
    >
      {value != null && value > 0
        ? type === 'currency'
          ? BRL(value)
          : value.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
        : <span className="text-gray-400">—</span>}
    </button>
  )
}

// ─── Autocomplete de Código ───────────────────────────────────────────────────

function CodigoAutocomplete({
  value,
  orcamentoId,
  className,
  onSelect,
  onChange,
}: {
  value: string
  orcamentoId: string
  className?: string
  onSelect: (s: SugestaoCodigo) => void
  onChange: (v: string) => void
}) {
  const [sugestoes, setSugestoes] = useState<SugestaoCodigo[]>([])
  const [aberto, setAberto] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleChange(v: string) {
    onChange(v)
    setCursor(-1)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!v) { setSugestoes([]); setAberto(false); return }
    debounceRef.current = setTimeout(async () => {
      const res = await buscarSugestoesCodigo(orcamentoId, v)
      setSugestoes(res)
      setAberto(res.length > 0)
    }, 220)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!aberto) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, sugestoes.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); select(sugestoes[cursor]) }
    if (e.key === 'Escape') setAberto(false)
  }

  function select(s: SugestaoCodigo) {
    onSelect(s)
    setAberto(false)
    setSugestoes([])
    setCursor(-1)
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        autoComplete="off"
        className={className}
      />
      {aberto && (
        <ul className="absolute z-50 left-0 top-full mt-0.5 w-80 bg-white border border-gray-300 rounded shadow-lg text-xs max-h-52 overflow-y-auto">
          {sugestoes.map((s, i) => (
            <li
              key={`${s.fonte}-${s.codigo}-${i}`}
              onMouseDown={() => select(s)}
              className={`px-3 py-1.5 cursor-pointer flex gap-2 items-center ${i === cursor ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <span className="font-mono font-semibold text-gray-800 whitespace-nowrap shrink-0">{s.codigo}</span>
              <span className="text-gray-500 truncate flex-1">{s.descricao}</span>
              <span className={`shrink-0 text-[10px] px-1 py-0.5 rounded font-medium ${s.fonte === 'insumo' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {s.fonte === 'insumo' ? 'INS' : 'COM'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Formulário de novo item ──────────────────────────────────────────────────

function AddItemForm({
  orcamentoId,
  parentId,
  parentNivel,
  parentNumero,
  parentDescricao,
  onClose,
}: {
  orcamentoId: string
  parentId: string | null
  parentNivel: number
  parentNumero: string
  parentDescricao?: string
  onClose: (newItem?: EstruturaItem) => void
}) {
  const [tipo, setTipo] = useState<'item' | 'grupo'>('item')
  const [form, setForm] = useState({
    numero: '',
    codigo: '',
    descricao: '',
    unidade: '',
    quantidade: '',
    custo_unitario: '',
  })
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
    } finally {
      setLoading(false)
    }
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
        <div>
          <label className="block text-gray-500 mb-0.5">Código</label>
          <CodigoAutocomplete
            value={form.codigo}
            orcamentoId={orcamentoId}
            className={`${inp} w-24`}
            onChange={v => setForm(p => ({ ...p, codigo: v }))}
            onSelect={s => setForm(p => ({
              ...p,
              codigo: s.codigo,
              descricao: s.descricao,
              unidade: s.unidade,
              custo_unitario: s.custo_unitario != null ? String(s.custo_unitario) : p.custo_unitario,
            }))}
          />
        </div>
      )}
      <div className="flex-1 min-w-48">
        <label className="block text-gray-500 mb-0.5">Descrição *</label>
        <input required value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
          className={inp} />
      </div>
      {tipo === 'item' && (
        <>
          <div>
            <label className="block text-gray-500 mb-0.5">Und</label>
            <input value={form.unidade} onChange={e => setForm(p => ({ ...p, unidade: e.target.value }))}
              className={`${inp} w-16`} />
          </div>
          <div>
            <label className="block text-gray-500 mb-0.5">Qtde</label>
            <input type="number" step="any" value={form.quantidade}
              onChange={e => setForm(p => ({ ...p, quantidade: e.target.value }))}
              className={`${inp} w-20`} />
          </div>
          <div>
            <label className="block text-gray-500 mb-0.5">R$ Unit.</label>
            <input type="number" step="any" value={form.custo_unitario}
              onChange={e => setForm(p => ({ ...p, custo_unitario: e.target.value }))}
              className={`${inp} w-28`} />
          </div>
        </>
      )}
      <div className="flex gap-1">
        <button type="submit" disabled={loading}
          className="rounded bg-blue-600 px-3 py-1 text-white font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? '...' : 'Salvar'}
        </button>
        <button type="button" onClick={() => onClose()}
          className="rounded border px-3 py-1 text-gray-600 hover:bg-gray-100">
          ✕
        </button>
      </div>
      </div>
    </form>
  )
}

// ─── View principal ───────────────────────────────────────────────────────────

export function PlanilhaView({
  initialItems,
  orcamentoId,
}: {
  initialItems: EstruturaItem[]
  orcamentoId: string
}) {
  const [items, setItems] = useState<EstruturaItem[]>(initialItems)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [addingParentId, setAddingParentId] = useState<string | null | 'root'>()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Rebuild tree e calcular totais sempre que items mudar
  const tree = buildTree(items)
  for (const n of tree) calcTotais(n)
  const grandTotal = tree.reduce((s, n) => s + n.total, 0)

  const flat = flattenTree(tree)
  // Filtra itens cujos pais estão colapsados
  const collapsedSet = collapsed
  const visible = flat.filter(({ nodo }) => {
    let pid = nodo.parent_id
    while (pid) {
      if (collapsedSet.has(pid)) return false
      const parent = items.find(i => i.id === pid)
      pid = parent?.parent_id ?? null
    }
    return true
  })

  // ID do nó após o qual o formulário inline deve aparecer (último descendente visível do grupo)
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
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleUpdate(id: string, fields: { quantidade?: number; custo_unitario?: number }) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...fields } : it))
    await atualizarItemEstrutura(id, orcamentoId, fields)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este item e todos seus sub-itens?')) return
    setDeletingId(id)
    // Remove o item e seus descendentes do estado local
    const toRemove = new Set<string>()
    function collectIds(itemId: string) {
      toRemove.add(itemId)
      for (const it of items) {
        if (it.parent_id === itemId) collectIds(it.id)
      }
    }
    collectIds(id)
    setItems(prev => prev.filter(it => !toRemove.has(it.id)))
    await deletarItemEstrutura(id, orcamentoId)
    setDeletingId(null)
  }

  async function handleExport() {
    const XLSX = await import('xlsx')
    const rows = flat.map(({ nodo, depth }) => ({
      'Item': nodo.numero,
      'Código': nodo.codigo ?? '',
      'Descrição': '  '.repeat(depth) + nodo.descricao,
      'Und': nodo.unidade ?? '',
      'Qtde': nodo.quantidade ?? '',
      'R$ Unit.': nodo.custo_unitario ?? '',
      'R$ Total': nodo.tipo === 'item'
        ? (nodo.quantidade ?? 0) * (nodo.custo_unitario ?? 0)
        : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Planilha')
    const today = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `planilha_${today}.xlsx`)
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-200 p-12 text-center text-gray-400">
        <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm font-medium text-gray-500">Planilha vazia</p>
        <p className="text-xs mt-1">Importe um CSV ou adicione itens manualmente.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Barra de ferramentas */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <button
            onClick={() => setAddingParentId('root')}
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Capítulo
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900">
            Total: {BRL(grandTotal)}
          </span>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar XLSX
          </button>
        </div>
      </div>

      {/* Formulário de novo capítulo (raiz) */}
      {addingParentId === 'root' && (
        <AddItemForm
          orcamentoId={orcamentoId}
          parentId={null}
          parentNivel={0}
          parentNumero=""
          onClose={(newItem) => {
            if (newItem) setItems(prev => [...prev, newItem])
            setAddingParentId(undefined)
          }}
        />
      )}

      {/* Tabela hierárquica */}
      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-18rem)] rounded-lg border border-gray-200">
        <table className="w-full text-xs min-w-[700px]">
          <thead className="sticky top-0 z-10 bg-gray-50 text-left text-gray-500 uppercase text-[10px] tracking-wide">
            <tr>
              <th className="px-3 py-2 w-28">Item</th>
              <th className="px-3 py-2 w-24">Código</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2 w-14 text-center">Und</th>
              <th className="px-3 py-2 w-24 text-right">Qtde</th>
              <th className="px-3 py-2 w-28 text-right">R$ Unit.</th>
              <th className="px-3 py-2 w-32 text-right">R$ Total</th>
              <th className="px-3 py-2 w-16 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ nodo, depth }) => {
              const hasFilhos = nodo.filhos.length > 0
              const isCollapsed = collapsed.has(nodo.id)
              const total = nodo.total
              const isGroup = nodo.tipo === 'grupo'
              const addingHere = addingParentId === nodo.id
              const showFormAfter = nodo.id === formHostId

              return (
                <Fragment key={nodo.id}>
                  <tr
                    className={`border-b border-gray-200/60 ${rowStyle(depth)} ${deletingId === nodo.id ? 'opacity-40' : ''}`}
                  >
                    {/* Número */}
                    <td className="px-3 py-2 font-mono" style={{ paddingLeft: `${12 + depth * 16}px` }}>
                      <div className="flex items-center gap-1">
                        {isGroup && (
                          <button
                            onClick={() => hasFilhos && toggleCollapse(nodo.id)}
                            className={`w-4 h-4 flex items-center justify-center rounded text-xs ${hasFilhos ? 'hover:bg-black/10 cursor-pointer' : 'invisible'}`}
                          >
                            {isCollapsed ? '▶' : '▼'}
                          </button>
                        )}
                        <span className={isGroup ? '' : 'pl-5'}>{nodo.numero}</span>
                      </div>
                    </td>

                    {/* Código */}
                    <td className="px-3 py-2 font-mono text-gray-400 text-[10px]">
                      {nodo.codigo ?? (isGroup ? '' : '—')}
                    </td>

                    {/* Descrição */}
                    <td className="px-3 py-2 max-w-xs">
                      <span title={nodo.descricao} className="line-clamp-2">{nodo.descricao}</span>
                    </td>

                    {/* Und */}
                    <td className="px-3 py-2 text-center text-gray-500">
                      {nodo.unidade ?? ''}
                    </td>

                    {/* Qtde (editável) */}
                    <td className="px-3 py-2 w-24">
                      {!isGroup ? (
                        <EditableCell
                          value={nodo.quantidade}
                          type="number"
                          onSave={v => handleUpdate(nodo.id, { quantidade: v })}
                        />
                      ) : null}
                    </td>

                    {/* R$ Unit. (editável) */}
                    <td className="px-3 py-2 w-28">
                      {!isGroup ? (
                        <EditableCell
                          value={nodo.custo_unitario}
                          type="currency"
                          onSave={v => handleUpdate(nodo.id, { custo_unitario: v })}
                        />
                      ) : null}
                    </td>

                    {/* R$ Total */}
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {total > 0 ? BRL(total) : <span className="text-gray-300 font-normal">—</span>}
                    </td>

                    {/* Ações */}
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        {isGroup && (
                          <button
                            onClick={() => setAddingParentId(addingHere ? undefined : nodo.id)}
                            title="Adicionar sub-item"
                            className="rounded p-1 hover:bg-black/10 text-current opacity-60 hover:opacity-100"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(nodo.id)}
                          title="Remover"
                          className="rounded p-1 hover:bg-red-100 text-current opacity-40 hover:opacity-100 hover:text-red-700"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Formulário inline — aparece após o último filho do grupo */}
                  {showFormAfter && addingParentGroup && (
                    <tr>
                      <td colSpan={8} className="px-2 py-1.5">
                        <AddItemForm
                          orcamentoId={orcamentoId}
                          parentId={addingParentGroup.id}
                          parentNivel={addingParentGroup.nivel}
                          parentNumero={addingParentGroup.numero}
                          parentDescricao={addingParentGroup.descricao}
                          onClose={(newItem) => {
                            if (newItem) setItems(prev => [...prev, newItem])
                            setAddingParentId(undefined)
                          }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}

            {/* Rodapé com total geral */}
            <tr className="bg-gray-800 text-white font-bold">
              <td colSpan={6} className="px-4 py-3 text-right text-sm uppercase tracking-wide">
                Total Geral
              </td>
              <td className="px-3 py-3 text-right text-sm tabular-nums">
                {BRL(grandTotal)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
