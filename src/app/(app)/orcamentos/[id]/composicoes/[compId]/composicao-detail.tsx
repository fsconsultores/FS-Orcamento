'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { recalcularComposicaoAction } from '../../planilha/calcular-action'

type InsumoRow = {
  id: string
  codigo: string
  descricao: string
  unidade: string
  custo: number
  indice: number
  grupo: string | null
}

type Composicao = {
  id: string
  codigo: string
  descricao: string
  unidade: string
  base: string | null
}

type Sugestao = {
  codigo: string
  descricao: string
  unidade: string
  custo: number
  tipo: 'insumo' | 'composicao'
}

const BRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const NUM = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 6 })

// ─── Autocomplete ─────────────────────────────────────────────────────────────

function Autocomplete({
  orcamentoId, compId, tipo,
  value, onChange, onSelect, placeholder,
}: {
  orcamentoId: string
  compId: string
  tipo: 'insumo' | 'composicao'
  value: string
  onChange: (v: string) => void
  onSelect: (s: Sugestao) => void
  placeholder: string
}) {
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([])
  const [aberto, setAberto] = useState(false)
  const [cursor, setCursor] = useState(-1)
  const [pos, setPos] = useState({ left: 0, top: 0, width: 300 })
  const inputRef = useRef<HTMLInputElement>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (aberto && inputRef.current) {
      const r = inputRef.current.getBoundingClientRect()
      setPos({ left: r.left, top: r.bottom + 2, width: Math.max(r.width, 340) })
    }
  }, [aberto, sugestoes.length])

  async function search(q: string) {
    const sb = createClient() as any
    if (tipo === 'insumo') {
      const query = q
        ? sb.from('orcamento_insumos').select('codigo, descricao, unidade, custo').eq('orcamento_id', orcamentoId).is('composicao_id', null).or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`).limit(12)
        : sb.from('orcamento_insumos').select('codigo, descricao, unidade, custo').eq('orcamento_id', orcamentoId).is('composicao_id', null).order('codigo').limit(12)
      const { data } = await query
      setSugestoes((data ?? []).map((i: any) => ({ ...i, tipo: 'insumo' as const })))
    } else {
      const query = q
        ? sb.from('orcamento_composicoes').select('codigo, descricao, unidade').eq('orcamento_id', orcamentoId).neq('id', compId).or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`).limit(12)
        : sb.from('orcamento_composicoes').select('codigo, descricao, unidade').eq('orcamento_id', orcamentoId).neq('id', compId).order('codigo').limit(12)
      const { data } = await query
      setSugestoes((data ?? []).map((c: any) => ({ ...c, custo: 0, tipo: 'composicao' as const })))
    }
    setAberto(true)
    setCursor(-1)
  }

  function handleChange(v: string) {
    onChange(v)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => search(v), 200)
  }

  function handleFocus() { search(value) }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!aberto) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, sugestoes.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); select(sugestoes[cursor]) }
    if (e.key === 'Escape') setAberto(false)
  }

  function select(s: Sugestao) {
    onSelect(s)
    setAberto(false)
    setSugestoes([])
    setCursor(-1)
  }

  return (
    <>
      <input
        ref={inputRef}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />
      {aberto && sugestoes.length > 0 && (
        <ul className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl text-sm max-h-56 overflow-y-auto"
          style={{ left: pos.left, top: pos.top, width: pos.width }}>
          {sugestoes.map((s, i) => (
            <li key={`${s.codigo}-${i}`} onMouseDown={() => select(s)}
              className={`px-3 py-2 cursor-pointer flex gap-2 items-center ${i === cursor ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
              <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${s.tipo === 'insumo' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                {s.tipo === 'insumo' ? 'INS' : 'COM'}
              </span>
              <span className="font-mono text-xs text-gray-600 shrink-0">{s.codigo}</span>
              <span className="text-gray-700 truncate flex-1">{s.descricao}</span>
              <span className="shrink-0 text-gray-400 text-xs">{s.unidade}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ComposicaoDetail({
  composicao,
  initialInsumos,
  orcamentoId,
  custoInicial,
  autoOpenAdd = false,
}: {
  composicao: Composicao
  initialInsumos: InsumoRow[]
  orcamentoId: string
  custoInicial: number
  autoOpenAdd?: boolean
}) {
  const [insumos, setInsumos] = useState(initialInsumos)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [adding, setAdding] = useState(autoOpenAdd)
  const [saving, setSaving] = useState(false)
  const [addTipo, setAddTipo] = useState<'insumo' | 'composicao'>('insumo')
  const [addSearch, setAddSearch] = useState('')
  const [addIndice, setAddIndice] = useState('1')
  const [selected, setSelected] = useState<Sugestao | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'erro'>('idle')
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const custoTotal = insumos.reduce((s, i) => s + (i.custo ?? 0) * (i.indice ?? 1), 0) || custoInicial

  async function sincronizar(novosInsumos?: typeof insumos) {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    setSyncStatus('syncing')
    try {
      await recalcularComposicaoAction(composicao.id, orcamentoId)
      setSyncStatus('ok')
      syncTimerRef.current = setTimeout(() => setSyncStatus('idle'), 2500)
    } catch {
      setSyncStatus('erro')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover este item da composição?')) return
    setDeletingId(id)
    setInsumos(prev => prev.filter(i => i.id !== id))
    const sb = createClient() as any
    const { error } = await sb.from('orcamento_insumos').delete().eq('id', id)
    if (error) {
      setInsumos(initialInsumos)
      alert(`Erro: ${error.message}`)
    }
    setDeletingId(null)
    sincronizar()
  }

  async function handleSaveIndice(id: string) {
    const val = parseFloat(editDraft.replace(',', '.'))
    if (isNaN(val) || val <= 0) { setEditingId(null); return }
    setInsumos(prev => prev.map(i => i.id === id ? { ...i, indice: val } : i))
    setEditingId(null)
    const sb = createClient() as any
    await sb.from('orcamento_insumos').update({ indice: val, custo_atualizado_em: new Date().toISOString() }).eq('id', id)
    sincronizar()
  }

  async function handleAdd() {
    if (!selected) return
    const indice = parseFloat(addIndice.replace(',', '.'))
    if (isNaN(indice) || indice <= 0) { alert('Índice inválido.'); return }

    setSaving(true)
    const sb = createClient() as any
    const row = {
      orcamento_id: orcamentoId,
      composicao_id: composicao.id,
      codigo: selected.codigo,
      descricao: selected.descricao,
      unidade: selected.unidade,
      custo: selected.custo,
      indice,
      grupo: addTipo === 'composicao' ? 'COMPOSIÇÃO AUXILIAR' : null,
      custo_atualizado_em: new Date().toISOString(),
    }
    const { data, error } = await sb.from('orcamento_insumos').insert(row).select('id, codigo, descricao, unidade, custo, indice, grupo').single()
    if (error) { alert(`Erro: ${error.message}`); setSaving(false); return }
    setInsumos(prev => [...prev, data as InsumoRow])
    setSelected(null)
    setAddSearch('')
    setAddIndice('1')
    setAdding(false)
    setSaving(false)
    sincronizar()
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/orcamentos/${orcamentoId}/composicoes`} className="text-sm text-blue-600 hover:underline">
            ← Composições
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{composicao.descricao}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {composicao.codigo} · {composicao.unidade}
            {composicao.base && <> · <span className="text-gray-400">{composicao.base}</span></>}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Custo unitário</p>
          <p className="text-2xl font-bold text-gray-900">{BRL(custoTotal)}</p>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <p className="text-xs text-gray-400">/{composicao.unidade}</p>
            {syncStatus === 'syncing' && (
              <span className="text-[10px] text-orange-500 flex items-center gap-0.5">
                <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                sincronizando…
              </span>
            )}
            {syncStatus === 'ok' && (
              <span className="text-[10px] text-green-600">✓ planilha atualizada</span>
            )}
            {syncStatus === 'erro' && (
              <span className="text-[10px] text-red-500">⚠ erro ao sincronizar</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabela de insumos */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold text-gray-900">
            Itens <span className="text-sm font-normal text-gray-400">({insumos.length})</span>
          </h2>
          <button
            onClick={() => { setAdding(a => !a); setSelected(null); setAddSearch(''); setAddIndice('1') }}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Adicionar item
          </button>
        </div>

        {/* Formulário de adição */}
        {adding && (
          <div className="border-b bg-blue-50 px-4 py-3 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Tipo</label>
                <select
                  value={addTipo}
                  onChange={e => { setAddTipo(e.target.value as any); setSelected(null); setAddSearch('') }}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="insumo">Insumo</option>
                  <option value="composicao">Composição auxiliar</option>
                </select>
              </div>
              <div className="flex-1 min-w-56 space-y-1">
                <label className="text-xs font-medium text-gray-600">
                  {addTipo === 'insumo' ? 'Buscar insumo' : 'Buscar composição'}
                </label>
                <Autocomplete
                  orcamentoId={orcamentoId}
                  compId={composicao.id}
                  tipo={addTipo}
                  value={addSearch}
                  onChange={v => { setAddSearch(v); setSelected(null) }}
                  onSelect={s => { setSelected(s); setAddSearch(`${s.codigo} — ${s.descricao}`) }}
                  placeholder={addTipo === 'insumo' ? 'Código ou descrição do insumo...' : 'Código ou descrição da composição...'}
                />
              </div>
              <div className="space-y-1 w-24">
                <label className="text-xs font-medium text-gray-600">Índice</label>
                <input
                  type="number" step="any" min="0.000001"
                  value={addIndice}
                  onChange={e => setAddIndice(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none text-right"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!selected || saving}
                  className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {saving ? 'Salvando…' : 'Adicionar'}
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="rounded-md border px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
            {selected && (
              <p className="text-xs text-blue-700 bg-blue-100 rounded px-2 py-1">
                <span className="font-mono font-semibold">{selected.codigo}</span> — {selected.descricao} · {selected.unidade}
                {selected.custo > 0 && <> · {BRL(selected.custo)}</>}
              </p>
            )}
          </div>
        )}

        {insumos.length === 0 && !adding ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            Nenhum item. Clique em "Adicionar item" para começar.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descrição</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Und</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Preço unit.</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Índice</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Custo</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {insumos.map(ins => (
                <tr key={ins.id} className={`group hover:bg-gray-50 ${deletingId === ins.id ? 'opacity-30' : ''}`}>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{ins.codigo || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-900">
                    {ins.descricao}
                    {ins.grupo && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">{ins.grupo}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{ins.unidade}</td>
                  <td className="px-4 py-2.5 text-right text-gray-600 tabular-nums">{BRL(ins.custo ?? 0)}</td>
                  <td className="px-4 py-2.5 text-right w-28">
                    {editingId === ins.id ? (
                      <input
                        autoFocus type="number" step="any" min="0.000001"
                        value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        onBlur={() => handleSaveIndice(ins.id)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveIndice(ins.id)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        className="w-full text-right border border-blue-400 rounded px-1.5 py-0.5 text-sm focus:outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => { setEditingId(ins.id); setEditDraft(String(ins.indice ?? 1)) }}
                        title="Clique para editar o índice"
                        className="block w-full text-right tabular-nums text-gray-700 hover:text-blue-600 hover:underline cursor-text"
                      >
                        {NUM(ins.indice ?? 1)}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium text-gray-900 tabular-nums">
                    {BRL((ins.custo ?? 0) * (ins.indice ?? 1))}
                  </td>
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => handleDelete(ins.id)}
                      className="opacity-0 group-hover:opacity-100 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-gray-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right font-semibold text-gray-700">Total</td>
                <td className="px-4 py-3 text-right font-bold text-gray-900 tabular-nums">{BRL(custoTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
