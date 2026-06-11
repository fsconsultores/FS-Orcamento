'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { sincronizarCustosPlanilha } from '@/lib/orcamento'
import type { OrcamentoInsumo } from '@/lib/orcamento'
import { ClientPagination } from '@/components/client-pagination'

const PAGE_SIZE = 100

const GRUPOS = [
  { value: 'E',  label: 'E — Equipamento' },
  { value: 'H',  label: 'H — Mão de Obra' },
  { value: 'HH', label: 'HH — Mão de Obra Horista' },
  { value: 'M',  label: 'M — Material' },
  { value: 'N',  label: 'N — Material' },
  { value: 'O',  label: 'O — Material' },
  { value: 'P',  label: 'P — Material' },
  { value: 'Q',  label: 'Q — Material' },
  { value: 'R',  label: 'R — Material' },
  { value: 'S',  label: 'S — Serviço de Terceiros' },
  { value: 'T',  label: 'T — Transporte' },
]

type EditableField = 'custo' | 'grupo' | 'base'

interface Editing {
  id: string
  field: EditableField
  value: string
}

interface ComposicoesModal {
  insumo: OrcamentoInsumo
  loading: boolean
  composicoes: { id: string; codigo: string; descricao: string; unidade: string }[]
}

function InlineInput({
  value,
  type = 'text',
  align = 'left',
  onCommit,
  onCancel,
}: {
  value: string
  type?: 'text' | 'number'
  align?: 'left' | 'right'
  onCommit: (v: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(value)

  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])

  return (
    <input
      ref={ref}
      type={type}
      value={draft}
      step={type === 'number' ? 'any' : undefined}
      min={type === 'number' ? '0' : undefined}
      onChange={e => setDraft(e.target.value)}
      onBlur={e => onCommit(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); onCommit(ref.current?.value ?? draft) }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      className={`block w-full rounded border border-blue-400 bg-white px-2 py-0.5 text-sm outline-none ring-2 ring-blue-400/20 ${align === 'right' ? 'text-right' : 'text-left'}`}
    />
  )
}

function InlineSelect({
  value,
  options,
  onCommit,
  onCancel,
}: {
  value: string
  options: { value: string; label: string }[]
  onCommit: (v: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLSelectElement>(null)
  useEffect(() => { ref.current?.focus() }, [])

  return (
    <select
      ref={ref}
      defaultValue={value}
      onChange={e => onCommit(e.target.value)}
      onBlur={() => onCancel()}
      onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); onCancel() } }}
      className="block w-full rounded border border-blue-400 bg-white px-2 py-0.5 text-sm outline-none ring-2 ring-blue-400/20"
    >
      <option value="">—</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function OrcamentoInsumosTable({
  initialInsumos,
  orcamentoId,
}: {
  initialInsumos: OrcamentoInsumo[]
  orcamentoId: string
}) {
  const [insumos, setInsumos] = useState(initialInsumos)
  const [query, setQuery] = useState('')

  useEffect(() => { setInsumos(initialInsumos) }, [initialInsumos])
  const [currentPage, setCurrentPage] = useState(1)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [editingCustoValue, setEditingCustoValue] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [composicoesModal, setComposicoesModal] = useState<ComposicoesModal | null>(null)

  const q = query.trim().toLowerCase()
  const visible = q
    ? insumos.filter(ins =>
        ins.codigo.toLowerCase().includes(q) ||
        ins.descricao.toLowerCase().includes(q)
      )
    : insumos

  useEffect(() => { setCurrentPage(1) }, [q])

  const paged = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function startEdit(e: React.MouseEvent, id: string, field: EditableField, value: string) {
    e.preventDefault()
    e.stopPropagation()
    if (savingId) return
    if (field === 'custo') setEditingCustoValue(value)
    setEditing({ id, field, value })
  }

  function cancelEdit() {
    setEditing(null)
  }

  async function saveCusto(id: string, rawValue: string) {
    const alvo = insumos.find(ins => ins.id === id)
    if (!alvo) return
    const str = rawValue.trim().replace(',', '.')
    const parsed = str === '' ? 0 : parseFloat(str)
    if (isNaN(parsed) || parsed < 0) return
    if (parsed === alvo.custo) return

    const agora = new Date().toISOString()
    const custoAnterior = alvo.custo
    setInsumos(prev => prev.map(ins =>
      ins.codigo === alvo.codigo
        ? { ...ins, custo: parsed, custo_atualizado_em: agora }
        : ins
    ))

    setSavingId(id)
    try {
      const sb = createClient() as any
      const { data: comps } = await sb
        .from('orcamento_composicoes')
        .select('id')
        .eq('orcamento_id', orcamentoId)
      const compIds: string[] = (comps ?? []).map((c: any) => c.id)

      await sb
        .from('orcamento_insumos')
        .update({ custo: parsed })
        .eq('codigo', alvo.codigo)
        .eq('orcamento_id', orcamentoId)

      for (let i = 0; i < compIds.length; i += 500) {
        await sb
          .from('orcamento_insumos')
          .update({ custo: parsed })
          .eq('codigo', alvo.codigo)
          .in('composicao_id', compIds.slice(i, i + 500))
      }

      try {
        await sincronizarCustosPlanilha(sb, orcamentoId)
      } catch (syncErr) {
        console.error('Erro ao sincronizar custos da planilha:', syncErr)
      }
    } catch {
      setInsumos(prev => prev.map(ins =>
        ins.codigo === alvo.codigo
          ? { ...ins, custo: custoAnterior, custo_atualizado_em: alvo.custo_atualizado_em ?? null }
          : ins
      ))
      alert('Erro ao salvar custo. Verifique a conexão e tente novamente.')
    } finally {
      setSavingId(null)
    }
  }

  async function commitEdit(draft: string) {
    if (!editing) return
    const { id, field } = editing
    setEditing(null)

    const alvo = insumos.find(ins => ins.id === id)
    if (!alvo) return

    // Campos texto simples
    const novoValor = draft.trim() || null
    const valorAtual = (alvo[field] as string | null) ?? null
    if (novoValor === valorAtual) return

    setSavingId(id)
    const sb = createClient() as any
    const { error } = await sb
      .from('orcamento_insumos')
      .update({ [field]: novoValor })
      .eq('id', id)

    if (!error) {
      setInsumos(prev => prev.map(ins =>
        ins.id === id ? { ...ins, [field]: novoValor } : ins
      ))
    }
    setSavingId(null)
  }

  async function handleDelete(id: string, codigo: string) {
    if (!confirm(`Excluir o insumo "${codigo}"?`)) return
    setDeletingId(id)
    setInsumos(prev => prev.filter(i => i.id !== id))
    const sb = createClient() as any
    const { error } = await sb.from('orcamento_insumos').delete().eq('id', id)
    if (error) {
      setInsumos(initialInsumos)
      alert(`Erro ao excluir: ${error.message}`)
    }
    setDeletingId(null)
  }

  async function openComposicoesModal(insumo: OrcamentoInsumo, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setComposicoesModal({ insumo, loading: true, composicoes: [] })
    const sb = createClient() as any
    const { data: items } = await sb
      .from('orcamento_insumos')
      .select('composicao_id')
      .eq('orcamento_id', orcamentoId)
      .eq('codigo', insumo.codigo)
      .not('composicao_id', 'is', null)

    const compIds = [...new Set<string>((items ?? []).map((i: any) => i.composicao_id))]
    if (compIds.length === 0) {
      setComposicoesModal(prev => prev ? { ...prev, loading: false, composicoes: [] } : null)
      return
    }
    const { data: comps } = await sb
      .from('orcamento_composicoes')
      .select('id, codigo, descricao, unidade')
      .in('id', compIds)
      .order('codigo')
    setComposicoesModal(prev => prev ? { ...prev, loading: false, composicoes: comps ?? [] } : null)
  }

  async function handleClear() {
    const avulsos = insumos.filter(i => i.composicao_id === null)
    if (avulsos.length === 0) return
    if (!confirm(`Excluir todos os ${avulsos.length} insumos avulsos deste orçamento? Esta ação não pode ser desfeita.`)) return
    setInsumos(prev => prev.filter(i => i.composicao_id !== null))
    const sb = createClient() as any
    const { error } = await sb
      .from('orcamento_insumos')
      .delete()
      .eq('orcamento_id', orcamentoId)
      .is('composicao_id', null)
    if (error) {
      setInsumos(initialInsumos)
      alert(`Erro ao limpar insumos: ${error.message}`)
    }
  }

  async function handleExport() {
    const XLSX = await import('xlsx')
    const rows = insumos.map(ins => ({
      'Código': ins.codigo,
      'Descrição': ins.descricao,
      'Unidade': ins.unidade,
      'Custo': ins.custo,
      'Grupo': ins.grupo ?? '',
      'Base': ins.base ?? '',
      'Data Ref.': ins.custo_atualizado_em
        ? new Date(ins.custo_atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
        : '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Insumos')
    XLSX.writeFile(wb, `insumos_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  function cellClass(base = '') {
    return `cursor-text hover:bg-blue-50 rounded px-1 -mx-1 ${base}`
  }

  function isEditing(id: string, field: EditableField) {
    return editing?.id === id && editing?.field === field
  }

  return (
    <>
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input type="search" placeholder="Buscar por código ou descrição..."
            value={query} onChange={e => setQuery(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <button onClick={handleExport} disabled={insumos.length === 0}
          className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exportar XLSX
        </button>
        <button
          onClick={handleClear}
          disabled={insumos.filter(i => i.composicao_id === null).length === 0}
          className="flex items-center gap-1.5 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Limpar insumos
        </button>
      </div>

      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-16rem)] rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3 text-right">Custo</th>
              <th className="px-4 py-3">Grupo</th>
              <th className="px-4 py-3">Base</th>
              <th className="px-4 py-3">Data Ref.</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  {q ? 'Nenhum insumo encontrado para essa busca.' : 'Nenhum insumo cadastrado neste orçamento.'}
                </td>
              </tr>
            ) : (
              paged.map((insumo) => {
                const isSaving = savingId === insumo.id
                const isDeleting = deletingId === insumo.id
                return (
                  <tr key={insumo.id} className={`group hover:bg-gray-50 ${isDeleting ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{insumo.codigo}</td>
                    <td className="px-4 py-3">{insumo.descricao}</td>
                    <td className="px-4 py-3 text-gray-500">{insumo.unidade}</td>

                    {/* Custo */}
                    <td className="px-4 py-3 text-right w-36">
                      {isEditing(insumo.id, 'custo') ? (
                        <input
                          autoFocus
                          type="number"
                          min="0"
                          step="any"
                          value={editingCustoValue}
                          onChange={e => setEditingCustoValue(e.target.value)}
                          onBlur={e => { setEditing(null); saveCusto(insumo.id, e.target.value) }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const val = (e.target as HTMLInputElement).value
                              setEditing(null)
                              saveCusto(insumo.id, val)
                              const idx = paged.findIndex(i => i.id === insumo.id)
                              if (idx !== -1 && idx < paged.length - 1) {
                                const next = paged[idx + 1]
                                setEditingCustoValue(String(next.custo))
                                setEditing({ id: next.id, field: 'custo', value: String(next.custo) })
                              }
                            }
                            if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                          }}
                          className="block w-full text-right rounded border border-blue-400 bg-white px-2 py-0.5 text-sm outline-none ring-2 ring-blue-400/20 tabular-nums"
                        />
                      ) : (
                        <span
                          onClick={e => startEdit(e, insumo.id, 'custo', String(insumo.custo))}
                          className={`block text-right tabular-nums ${cellClass()} ${isSaving ? 'text-gray-400' : 'text-gray-900'}`}
                          title="Clique para editar"
                        >
                          {isSaving ? '…' : insumo.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </span>
                      )}
                    </td>

                    {/* Grupo */}
                    <td className="px-4 py-3 text-gray-500">
                      {isEditing(insumo.id, 'grupo') ? (
                        <InlineSelect value={insumo.grupo ?? ''} options={GRUPOS} onCommit={v => commitEdit(v)} onCancel={cancelEdit} />
                      ) : (
                        <span onClick={e => startEdit(e, insumo.id, 'grupo', insumo.grupo ?? '')}
                          className={cellClass()} title="Clique para editar">
                          {insumo.grupo || <span className="text-gray-300">—</span>}
                        </span>
                      )}
                    </td>

                    {/* Base */}
                    <td className="px-4 py-3 text-gray-500">
                      {isEditing(insumo.id, 'base') ? (
                        <InlineInput value={insumo.base ?? ''} onCommit={v => commitEdit(v)} onCancel={cancelEdit} />
                      ) : (
                        <span onClick={e => startEdit(e, insumo.id, 'base', insumo.base ?? '')}
                          className={cellClass()} title="Clique para editar">
                          {insumo.base || <span className="text-gray-300">—</span>}
                        </span>
                      )}
                    </td>

                    {/* Data Ref. — preenchida automaticamente ao atualizar custo */}
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {insumo.custo_atualizado_em
                        ? new Date(insumo.custo_atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </td>

                    <td className="px-2 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={e => openComposicoesModal(insumo, e)}
                          title="Ver composições que utilizam este insumo"
                          className="opacity-0 group-hover:opacity-100 rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-all">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                        </button>
                        <button onClick={() => handleDelete(insumo.id, insumo.codigo)}
                          title="Excluir insumo"
                          className="opacity-0 group-hover:opacity-100 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <ClientPagination total={visible.length} page={currentPage} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
    </div>

    {composicoesModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
        onClick={() => setComposicoesModal(null)}>
        <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Composições que utilizam este insumo</h2>
              <p className="text-xs text-gray-500 mt-0.5 font-mono">
                {composicoesModal.insumo.codigo} — {composicoesModal.insumo.descricao}
              </p>
            </div>
            <button onClick={() => setComposicoesModal(null)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {composicoesModal.loading ? (
            <p className="py-8 text-center text-sm text-gray-400">Carregando…</p>
          ) : composicoesModal.composicoes.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">Nenhuma composição utiliza este insumo neste orçamento.</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden max-h-80 overflow-y-auto">
              {composicoesModal.composicoes.map(c => (
                <li key={c.id}>
                  <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`}
                    onClick={() => setComposicoesModal(null)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors">
                    <span className="font-mono text-xs text-gray-500 w-24 shrink-0">{c.codigo}</span>
                    <span className="text-sm text-gray-900 flex-1 min-w-0 truncate">{c.descricao}</span>
                    <span className="text-xs text-gray-400 shrink-0">{c.unidade}</span>
                    <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )}
    </>
  )
}
