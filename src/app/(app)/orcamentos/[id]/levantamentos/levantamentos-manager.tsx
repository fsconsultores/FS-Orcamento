'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Levantamento, LevantamentoStatus } from '@/lib/orcamento'
import { InlineInput, InlineSelect } from '@/components/ui/inline-edit'
import { LevantamentoStatusBadge } from '@/components/levantamento-status-badge'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'

const STATUS_OPTIONS: { value: LevantamentoStatus; label: string }[] = [
  { value: 'nao_iniciado', label: 'Não iniciado' },
  { value: 'em_andamento', label: 'Em andamento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'com_pendencia', label: 'Com pendência' },
  { value: 'bloqueado', label: 'Bloqueado' },
]

type EditableField = 'nome' | 'responsavel' | 'data_inicio' | 'data_prazo'
interface Editing { id: string; field: EditableField }

function fmtData(iso: string | null): string {
  if (!iso) return '—'
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function cellClass(base = '') {
  return `cursor-text hover:bg-blue-50 rounded px-1 -mx-1 ${base}`
}

export function LevantamentosManager({
  orcamentoId,
  initialLevantamentos,
}: {
  orcamentoId: string
  initialLevantamentos: Levantamento[]
}) {
  const [levantamentos, setLevantamentos] = useState(initialLevantamentos)
  useEffect(() => { setLevantamentos(initialLevantamentos) }, [initialLevantamentos])

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Editing | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [addingLevantamento, setAddingLevantamento] = useState(false)
  const [novoItemDraft, setNovoItemDraft] = useState<Record<string, string>>({})
  const [novaPendenciaDraft, setNovaPendenciaDraft] = useState<Record<string, { item: string; problema: string; pergunta: string }>>({})
  const [mostrarFormPendencia, setMostrarFormPendencia] = useState<Set<string>>(new Set())

  // ─── Resumo ────────────────────────────────────────────────────────────
  const statusCounts = levantamentos.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1
    return acc
  }, {} as Record<LevantamentoStatus, number>)
  const totalItens = levantamentos.reduce((s, l) => s + l.itens.length, 0)
  const itensConcluidos = levantamentos.reduce((s, l) => s + l.itens.filter(i => i.concluido).length, 0)
  const pctConcluido = totalItens > 0 ? Math.round((itensConcluidos / totalItens) * 100) : 0
  const pendenciasAbertas = levantamentos.reduce((s, l) => s + l.pendencias.filter(p => p.status === 'aberta').length, 0)

  function toggleExpandido(id: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ─── Levantamento (área) ───────────────────────────────────────────────
  async function handleAddLevantamento() {
    const nome = novoNome.trim()
    if (!nome) return
    setAddingLevantamento(true)
    const sb = createClient() as any
    const { data, error } = await sb
      .from('orcamento_levantamentos')
      .insert({ orcamento_id: orcamentoId, nome, ordem: levantamentos.length })
      .select('id, orcamento_id, nome, responsavel, status, data_inicio, data_prazo, ordem, created_at')
      .single()
    setAddingLevantamento(false)
    if (error) { alert(`Erro ao criar levantamento: ${error.message}`); return }
    setLevantamentos(prev => [...prev, { ...data, itens: [], pendencias: [] }])
    setNovoNome('')
  }

  async function handleDeleteLevantamento(id: string, nome: string) {
    if (!confirm(`Excluir o levantamento "${nome}"? Isso remove também o checklist e as pendências dessa área.`)) return
    const anterior = levantamentos
    setLevantamentos(prev => prev.filter(l => l.id !== id))
    const sb = createClient() as any
    const { error } = await sb.from('orcamento_levantamentos').delete().eq('id', id)
    if (error) { setLevantamentos(anterior); alert(`Erro ao excluir: ${error.message}`) }
  }

  async function commitEdit(id: string, field: EditableField, valorBruto: string) {
    setEditing(null)
    const alvo = levantamentos.find(l => l.id === id)
    if (!alvo) return
    const novoValor = valorBruto.trim() || null
    const valorAtual = (alvo[field] as string | null) ?? null
    if (novoValor === valorAtual) return

    setLevantamentos(prev => prev.map(l => l.id === id ? { ...l, [field]: novoValor } : l))
    const sb = createClient() as any
    const { error } = await sb.from('orcamento_levantamentos').update({ [field]: novoValor }).eq('id', id)
    if (error) {
      setLevantamentos(prev => prev.map(l => l.id === id ? { ...l, [field]: valorAtual } : l))
      alert(`Erro ao salvar: ${error.message}`)
    }
  }

  async function commitStatus(id: string, status: LevantamentoStatus) {
    const alvo = levantamentos.find(l => l.id === id)
    if (!alvo || alvo.status === status) return
    const anterior = alvo.status
    setLevantamentos(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    const sb = createClient() as any
    const { error } = await sb.from('orcamento_levantamentos').update({ status }).eq('id', id)
    if (error) {
      setLevantamentos(prev => prev.map(l => l.id === id ? { ...l, status: anterior } : l))
      alert(`Erro ao salvar status: ${error.message}`)
    }
  }

  // ─── Checklist ─────────────────────────────────────────────────────────
  async function handleAddItem(levantamentoId: string) {
    const descricao = (novoItemDraft[levantamentoId] ?? '').trim()
    if (!descricao) return
    const alvo = levantamentos.find(l => l.id === levantamentoId)
    if (!alvo) return
    const sb = createClient() as any
    const { data, error } = await sb
      .from('orcamento_levantamento_itens')
      .insert({ levantamento_id: levantamentoId, descricao, ordem: alvo.itens.length })
      .select('id, levantamento_id, descricao, concluido, ordem, created_at')
      .single()
    if (error) { alert(`Erro ao adicionar item: ${error.message}`); return }
    setLevantamentos(prev => prev.map(l => l.id === levantamentoId ? { ...l, itens: [...l.itens, data] } : l))
    setNovoItemDraft(prev => ({ ...prev, [levantamentoId]: '' }))
  }

  async function handleToggleItem(levantamentoId: string, itemId: string, concluido: boolean) {
    setLevantamentos(prev => prev.map(l => l.id !== levantamentoId ? l : {
      ...l, itens: l.itens.map(i => i.id === itemId ? { ...i, concluido } : i),
    }))
    const sb = createClient() as any
    const { error } = await sb.from('orcamento_levantamento_itens').update({ concluido }).eq('id', itemId)
    if (error) {
      setLevantamentos(prev => prev.map(l => l.id !== levantamentoId ? l : {
        ...l, itens: l.itens.map(i => i.id === itemId ? { ...i, concluido: !concluido } : i),
      }))
      alert(`Erro ao atualizar item: ${error.message}`)
    }
  }

  async function handleDeleteItem(levantamentoId: string, itemId: string) {
    const anterior = levantamentos
    setLevantamentos(prev => prev.map(l => l.id !== levantamentoId ? l : { ...l, itens: l.itens.filter(i => i.id !== itemId) }))
    const sb = createClient() as any
    const { error } = await sb.from('orcamento_levantamento_itens').delete().eq('id', itemId)
    if (error) { setLevantamentos(anterior); alert(`Erro ao excluir item: ${error.message}`) }
  }

  // ─── Pendências ────────────────────────────────────────────────────────
  function togglePendenciaForm(levantamentoId: string) {
    setMostrarFormPendencia(prev => {
      const next = new Set(prev)
      if (next.has(levantamentoId)) next.delete(levantamentoId)
      else next.add(levantamentoId)
      return next
    })
  }

  async function handleAddPendencia(levantamentoId: string) {
    const draft = novaPendenciaDraft[levantamentoId]
    const problema = draft?.problema.trim()
    if (!problema) return
    const sb = createClient() as any
    const { data: { user } } = await sb.auth.getUser()
    const { data, error } = await sb
      .from('orcamento_levantamento_pendencias')
      .insert({
        levantamento_id: levantamentoId,
        item: draft.item.trim() || null,
        problema,
        pergunta: draft.pergunta.trim() || null,
        usuario: user?.email ?? null,
      })
      .select('id, levantamento_id, item, problema, pergunta, status, usuario, resolvida_em, created_at')
      .single()
    if (error) { alert(`Erro ao registrar pendência: ${error.message}`); return }
    setLevantamentos(prev => prev.map(l => l.id === levantamentoId ? { ...l, pendencias: [data, ...l.pendencias] } : l))
    setNovaPendenciaDraft(prev => ({ ...prev, [levantamentoId]: { item: '', problema: '', pergunta: '' } }))
    setMostrarFormPendencia(prev => { const next = new Set(prev); next.delete(levantamentoId); return next })
  }

  async function handleResolverPendencia(levantamentoId: string, pendenciaId: string) {
    const agora = new Date().toISOString()
    setLevantamentos(prev => prev.map(l => l.id !== levantamentoId ? l : {
      ...l, pendencias: l.pendencias.map(p => p.id === pendenciaId ? { ...p, status: 'resolvida', resolvida_em: agora } : p),
    }))
    const sb = createClient() as any
    const { error } = await sb.from('orcamento_levantamento_pendencias')
      .update({ status: 'resolvida', resolvida_em: agora }).eq('id', pendenciaId)
    if (error) {
      setLevantamentos(prev => prev.map(l => l.id !== levantamentoId ? l : {
        ...l, pendencias: l.pendencias.map(p => p.id === pendenciaId ? { ...p, status: 'aberta', resolvida_em: null } : p),
      }))
      alert(`Erro ao resolver pendência: ${error.message}`)
    }
  }

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <span className="text-2xl font-bold text-gray-900">{pctConcluido}%</span>
        <span className="text-xs text-gray-400">concluído ({itensConcluidos}/{totalItens} itens)</span>
        <span className="mx-2 h-6 w-px bg-gray-200" />
        {STATUS_OPTIONS.map(({ value, label }) => statusCounts[value] ? (
          <span key={value} className="flex items-center gap-1.5 text-xs text-gray-600">
            <LevantamentoStatusBadge status={value} /> {statusCounts[value]}
          </span>
        ) : null)}
        {pendenciasAbertas > 0 && (
          <span className="ml-auto flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium bg-amber-50 text-amber-700">
            ⚠️ {pendenciasAbertas} pendência(s) aguardando
          </span>
        )}
      </div>

      {/* Nova área */}
      <div className="flex items-center gap-2">
        <input
          type="text" placeholder="Nova área de levantamento (ex.: Impermeabilização)"
          value={novoNome} onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddLevantamento() } }}
          className="flex-1 max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <button onClick={handleAddLevantamento} disabled={addingLevantamento || !novoNome.trim()}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          <Plus size={14} /> Adicionar
        </button>
      </div>

      {/* Lista */}
      <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
        {levantamentos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Nenhum levantamento cadastrado ainda.</p>
        ) : (
        <>
        <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 text-xs font-medium uppercase text-gray-500">
          <span className="w-4 shrink-0" />
          <span className="w-48 shrink-0">Levantamento</span>
          <span className="w-36 shrink-0">Responsável</span>
          <span className="w-40 shrink-0">Status</span>
          <span className="w-24 shrink-0">Início</span>
          <span className="w-24 shrink-0">Prazo</span>
          <span className="w-16 shrink-0">Progresso</span>
        </div>
        {levantamentos.map(l => {
          const aberto = expandidos.has(l.id)
          const progresso = l.itens.length > 0 ? `${l.itens.filter(i => i.concluido).length}/${l.itens.length}` : '—'
          const draftPendencia = novaPendenciaDraft[l.id] ?? { item: '', problema: '', pergunta: '' }
          return (
            <div key={l.id}>
              <div className="group flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <button onClick={() => toggleExpandido(l.id)} className="text-gray-400 hover:text-gray-600 shrink-0">
                  <ChevronRight size={16} className={`transition-transform ${aberto ? 'rotate-90' : ''}`} />
                </button>

                <div className="w-48 shrink-0">
                  {editing?.id === l.id && editing.field === 'nome' ? (
                    <InlineInput value={l.nome} onCommit={v => commitEdit(l.id, 'nome', v)} onCancel={() => setEditing(null)} />
                  ) : (
                    <span onClick={() => setEditing({ id: l.id, field: 'nome' })} className={`font-medium text-gray-800 ${cellClass()}`} title="Clique para editar">
                      {l.nome}
                    </span>
                  )}
                </div>

                <div className="w-36 shrink-0 text-sm text-gray-500">
                  {editing?.id === l.id && editing.field === 'responsavel' ? (
                    <InlineInput value={l.responsavel ?? ''} onCommit={v => commitEdit(l.id, 'responsavel', v)} onCancel={() => setEditing(null)} />
                  ) : (
                    <span onClick={() => setEditing({ id: l.id, field: 'responsavel' })} className={cellClass()} title="Clique para editar">
                      {l.responsavel || <span className="text-gray-300">Sem responsável</span>}
                    </span>
                  )}
                </div>

                <div className="w-40 shrink-0">
                  <InlineSelect
                    value={l.status}
                    options={STATUS_OPTIONS}
                    onCommit={v => commitStatus(l.id, v as LevantamentoStatus)}
                    onCancel={() => {}}
                    allowEmpty={false}
                  />
                </div>

                <div className="w-24 shrink-0 text-sm text-gray-500">
                  {editing?.id === l.id && editing.field === 'data_inicio' ? (
                    <InlineInput type="date" value={l.data_inicio ?? ''} onCommit={v => commitEdit(l.id, 'data_inicio', v)} onCancel={() => setEditing(null)} />
                  ) : (
                    <span onClick={() => setEditing({ id: l.id, field: 'data_inicio' })} className={cellClass()} title="Início — clique para editar">
                      {fmtData(l.data_inicio)}
                    </span>
                  )}
                </div>

                <div className="w-24 shrink-0 text-sm text-gray-500">
                  {editing?.id === l.id && editing.field === 'data_prazo' ? (
                    <InlineInput type="date" value={l.data_prazo ?? ''} onCommit={v => commitEdit(l.id, 'data_prazo', v)} onCancel={() => setEditing(null)} />
                  ) : (
                    <span onClick={() => setEditing({ id: l.id, field: 'data_prazo' })} className={cellClass()} title="Prazo — clique para editar">
                      {fmtData(l.data_prazo)}
                    </span>
                  )}
                </div>

                <div className="w-16 shrink-0 text-sm tabular-nums text-gray-500">{progresso}</div>

                {l.pendencias.some(p => p.status === 'aberta') && (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700">
                    {l.pendencias.filter(p => p.status === 'aberta').length} pendência(s)
                  </span>
                )}

                <button onClick={() => handleDeleteLevantamento(l.id, l.nome)}
                  title="Excluir levantamento"
                  className="ml-auto opacity-0 group-hover:opacity-100 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>

              {aberto && (
                <div className="bg-gray-50/60 px-4 py-4 pl-11 space-y-4 border-t border-gray-100">
                  {/* Checklist */}
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-gray-500">Checklist</p>
                    <ul className="space-y-1">
                      {l.itens.map(item => (
                        <li key={item.id} className="group/item flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={item.concluido}
                            onChange={e => handleToggleItem(l.id, item.id, e.target.checked)}
                            className="h-3.5 w-3.5 accent-blue-600 cursor-pointer" />
                          <span className={item.concluido ? 'text-gray-400 line-through' : 'text-gray-700'}>{item.descricao}</span>
                          <button onClick={() => handleDeleteItem(l.id, item.id)}
                            className="opacity-0 group-hover/item:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                            <Trash2 size={12} />
                          </button>
                        </li>
                      ))}
                      {l.itens.length === 0 && <li className="text-sm text-gray-400">Nenhum item ainda.</li>}
                    </ul>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text" placeholder="Novo item do checklist..."
                        value={novoItemDraft[l.id] ?? ''}
                        onChange={e => setNovoItemDraft(prev => ({ ...prev, [l.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem(l.id) } }}
                        className="w-full max-w-xs rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <button onClick={() => handleAddItem(l.id)} className="text-xs font-medium text-blue-600 hover:underline shrink-0">
                        + Adicionar
                      </button>
                    </div>
                  </div>

                  {/* Pendências */}
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-gray-500">Pendências</p>
                    {l.pendencias.length > 0 && (
                      <ul className="space-y-1.5 mb-2">
                        {l.pendencias.map(p => (
                          <li key={p.id} className={`rounded-md border px-3 py-2 text-xs ${p.status === 'aberta' ? 'border-amber-200 bg-amber-50/60' : 'border-gray-200 bg-white opacity-60'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                {p.item && <span className="font-medium text-gray-700">{p.item}: </span>}
                                <span className="text-gray-600">{p.problema}</span>
                                {p.pergunta && <p className="mt-0.5 text-gray-500">Pergunta: {p.pergunta}</p>}
                              </div>
                              {p.status === 'aberta' ? (
                                <button onClick={() => handleResolverPendencia(l.id, p.id)}
                                  className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium bg-white border border-amber-300 text-amber-700 hover:bg-amber-100">
                                  Marcar resolvida
                                </button>
                              ) : (
                                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700">Resolvida</span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {mostrarFormPendencia.has(l.id) ? (
                      <div className="space-y-1.5 rounded-md border border-gray-200 bg-white p-2.5">
                        <input type="text" placeholder="Item (ex.: Fachada)"
                          value={draftPendencia.item}
                          onChange={e => setNovaPendenciaDraft(prev => ({ ...prev, [l.id]: { ...draftPendencia, item: e.target.value } }))}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500" />
                        <input type="text" placeholder="Problema *"
                          value={draftPendencia.problema}
                          onChange={e => setNovaPendenciaDraft(prev => ({ ...prev, [l.id]: { ...draftPendencia, problema: e.target.value } }))}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500" />
                        <input type="text" placeholder="Pergunta / o que precisa esclarecer"
                          value={draftPendencia.pergunta}
                          onChange={e => setNovaPendenciaDraft(prev => ({ ...prev, [l.id]: { ...draftPendencia, pergunta: e.target.value } }))}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500" />
                        <div className="flex justify-end gap-2 pt-1">
                          <button onClick={() => togglePendenciaForm(l.id)} className="text-xs text-gray-500 hover:underline">Cancelar</button>
                          <button onClick={() => handleAddPendencia(l.id)} disabled={!draftPendencia.problema.trim()}
                            className="rounded bg-amber-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50">
                            Registrar pendência
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => togglePendenciaForm(l.id)} className="text-xs font-medium text-amber-700 hover:underline">
                        + Registrar pendência
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        </>
        )}
      </div>
    </div>
  )
}
