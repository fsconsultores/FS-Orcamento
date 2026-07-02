'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarPlanilhaAction, renomearPlanilhaAction, excluirPlanilhaAction, duplicarPlanilhaAction } from './planilha/calcular-action'

type Planilha = { id: string; nome: string; bdi_global: number; ordem: number }

interface Props {
  orcamentoId: string
  nomeObra: string
  planilhas: Planilha[]
}

export function PlanilhasPicker({ orcamentoId, nomeObra, planilhas: initial }: Props) {
  const router = useRouter()
  const [planilhas, setPlanilhas] = useState<Planilha[]>(initial)

  // ── Nova planilha ──────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoBdi, setNovoBdi] = useState('25')
  const [criando, setCriando] = useState(false)
  const [erroForm, setErroForm] = useState('')

  // ── Renomear ───────────────────────────────────────────────────────────────
  const [renomearId, setRenomearId] = useState<string | null>(null)
  const [renomearNome, setRenomearNome] = useState('')

  // ── Excluir ────────────────────────────────────────────────────────────────
  const [confirmarExcluirId, setConfirmarExcluirId] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  // ── Duplicar ───────────────────────────────────────────────────────────────
  const [duplicandoId, setDuplicandoId] = useState<string | null>(null)

  async function handleCriar() {
    if (!novoNome.trim()) { setErroForm('Informe o nome.'); return }
    const bdi = parseFloat(novoBdi)
    if (isNaN(bdi) || bdi < 0) { setErroForm('BDI inválido.'); return }
    setCriando(true); setErroForm('')
    try {
      const nova = await criarPlanilhaAction(orcamentoId, novoNome.trim(), bdi)
      setPlanilhas(prev => [...prev, nova])
      setNovoNome(''); setNovoBdi('25'); setShowForm(false)
      router.push(`/orcamentos/${orcamentoId}/planilha?planilha=${nova.id}`)
    } catch (e) {
      setErroForm(String(e))
    } finally {
      setCriando(false)
    }
  }

  async function handleRenomear(id: string) {
    if (!renomearNome.trim()) { setRenomearId(null); return }
    try {
      const atualizada = await renomearPlanilhaAction(id, renomearNome.trim())
      setPlanilhas(prev => prev.map(p => p.id === id ? { ...p, nome: atualizada.nome } : p))
    } catch {}
    setRenomearId(null)
  }

  async function handleExcluir(id: string) {
    setExcluindo(true)
    try {
      await excluirPlanilhaAction(id)
      setPlanilhas(prev => prev.filter(p => p.id !== id))
    } catch {}
    setExcluindo(false)
    setConfirmarExcluirId(null)
  }

  async function handleDuplicar(id: string, nome: string) {
    setDuplicandoId(id)
    try {
      const nova = await duplicarPlanilhaAction(id, `Cópia de ${nome}`)
      setPlanilhas(prev => [...prev, nova])
    } catch {}
    setDuplicandoId(null)
  }

  return (
    <div className="mx-auto max-w-2xl py-8 px-4">
      {/* Cabeçalho */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{nomeObra}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {planilhas.length === 0
              ? 'Nenhuma planilha ainda'
              : `${planilhas.length} planilha${planilhas.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setErroForm('') }}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nova planilha
        </button>
      </div>

      {/* Formulário nova planilha */}
      {showForm && (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <p className="mb-3 text-sm font-semibold text-gray-700">Nova planilha</p>
          <div className="flex gap-3">
            <input
              autoFocus
              value={novoNome}
              onChange={e => { setNovoNome(e.target.value); setErroForm('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleCriar(); if (e.key === 'Escape') setShowForm(false) }}
              placeholder="Nome da planilha"
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="number" min="0" step="0.01"
              value={novoBdi}
              onChange={e => setNovoBdi(e.target.value)}
              placeholder="BDI %"
              className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button onClick={handleCriar} disabled={criando || !novoNome.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
              {criando ? 'Criando…' : 'Criar'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="rounded-md border px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
          {erroForm && <p className="mt-2 text-xs text-red-600">{erroForm}</p>}
        </div>
      )}

      {/* Lista de planilhas */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {planilhas.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <svg className="mx-auto w-10 h-10 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-gray-400">Nenhuma planilha ainda.</p>
            <button onClick={() => setShowForm(true)} className="mt-2 text-sm text-blue-600 hover:underline">
              Criar primeira planilha →
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {planilhas.map((p, i) => (
              <li key={p.id} className="group flex items-center gap-3 px-5 py-4 hover:bg-blue-50 transition-colors">
                {/* Número */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600 text-sm font-bold group-hover:bg-blue-200 transition-colors">
                  {i + 1}
                </div>

                {/* Nome (clicável para renomear inline) */}
                <div className="flex-1 min-w-0">
                  {renomearId === p.id ? (
                    <form onSubmit={e => { e.preventDefault(); handleRenomear(p.id) }} className="flex gap-2">
                      <input
                        autoFocus
                        value={renomearNome}
                        onChange={e => setRenomearNome(e.target.value)}
                        onBlur={() => handleRenomear(p.id)}
                        onKeyDown={e => e.key === 'Escape' && setRenomearId(null)}
                        className="flex-1 rounded border border-blue-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </form>
                  ) : (
                    <div>
                      <button
                        onClick={() => router.push(`/orcamentos/${orcamentoId}/planilha?planilha=${p.id}`)}
                        className="font-medium text-gray-900 hover:text-blue-700 text-left truncate max-w-full"
                      >
                        {p.nome}
                      </button>
                      {p.bdi_global > 0 && (
                        <p className="text-xs text-gray-400 mt-0.5">BDI: {p.bdi_global}%</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Ações */}
                {renomearId !== p.id && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => { setRenomearId(p.id); setRenomearNome(p.nome) }}
                      title="Renomear"
                      className="rounded p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDuplicar(p.id, p.nome)}
                      disabled={duplicandoId === p.id}
                      title="Duplicar"
                      className="rounded p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40"
                    >
                      {duplicandoId === p.id
                        ? <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                      }
                    </button>
                    <button
                      onClick={() => setConfirmarExcluirId(p.id)}
                      title="Excluir"
                      className="rounded p-1.5 text-red-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Seta abrir (sempre visível) */}
                {renomearId !== p.id && (
                  <button
                    onClick={() => router.push(`/orcamentos/${orcamentoId}/planilha?planilha=${p.id}`)}
                    className="shrink-0 text-gray-300 group-hover:text-blue-500 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Modal de confirmação de exclusão */}
      {confirmarExcluirId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-gray-900">Excluir planilha</h2>
            <p className="mt-2 text-sm text-gray-600">
              Todos os itens desta planilha serão removidos. Esta ação não pode ser desfeita.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => setConfirmarExcluirId(null)} disabled={excluindo}
                className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                Cancelar
              </button>
              <button onClick={() => handleExcluir(confirmarExcluirId)} disabled={excluindo}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-40">
                {excluindo ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
