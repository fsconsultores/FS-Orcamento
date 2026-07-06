'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { OrcamentoVersaoResumo, VersaoSnapshotV1 } from '@/lib/orcamento/versoes'
import { criarVersao, restaurarVersao, buscarSnapshotVersao } from './versoes-action'

function fmtData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

interface EstruturaPreviewNode {
  id: string
  numero: string
  descricao: string
  tipo: 'grupo' | 'item'
  filhos: EstruturaPreviewNode[]
}

function montarArvorePreview(estrutura: VersaoSnapshotV1['estrutura']): EstruturaPreviewNode[] {
  const map = new Map<string, EstruturaPreviewNode>()
  for (const item of estrutura) map.set(item.id, { id: item.id, numero: item.numero, descricao: item.descricao, tipo: item.tipo, filhos: [] })
  const roots: EstruturaPreviewNode[] = []
  for (const item of estrutura) {
    const node = map.get(item.id)!
    if (item.parent_id && map.has(item.parent_id)) map.get(item.parent_id)!.filhos.push(node)
    else roots.push(node)
  }
  return roots
}

function ArvorePreview({ nodes }: { nodes: EstruturaPreviewNode[] }) {
  return (
    <ul className="space-y-0.5">
      {nodes.map(n => (
        <li key={n.id}>
          <div className={n.tipo === 'grupo' ? 'font-semibold text-gray-800' : 'text-gray-600'}>
            <span className="font-mono text-xs text-gray-400 mr-1.5">{n.numero}</span>
            {n.descricao}
          </div>
          {n.filhos.length > 0 && (
            <div className="pl-4 border-l border-gray-200 ml-1">
              <ArvorePreview nodes={n.filhos} />
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

export function VersoesView({
  orcamentoId,
  versoesIniciais,
  fetchError,
}: {
  orcamentoId: string
  versoesIniciais: OrcamentoVersaoResumo[]
  fetchError?: string
}) {
  const router = useRouter()
  const versoes = versoesIniciais
  const [showCriar, setShowCriar] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [visualizando, setVisualizando] = useState<OrcamentoVersaoResumo | null>(null)
  const [snapshotVisualizado, setSnapshotVisualizado] = useState<VersaoSnapshotV1 | null>(null)
  const [carregandoSnapshot, setCarregandoSnapshot] = useState(false)

  const [restaurando, setRestaurando] = useState<OrcamentoVersaoResumo | null>(null)
  const [executandoRestore, setExecutandoRestore] = useState(false)
  const [erroRestore, setErroRestore] = useState<string | null>(null)

  const arvorePreview = useMemo(
    () => (snapshotVisualizado ? montarArvorePreview(snapshotVisualizado.estrutura) : []),
    [snapshotVisualizado]
  )

  async function handleCriar() {
    if (!mensagem.trim() || criando) return
    setCriando(true)
    setErro(null)
    try {
      await criarVersao(orcamentoId, mensagem)
      setShowCriar(false)
      setMensagem('')
      router.refresh()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar versão')
    } finally {
      setCriando(false)
    }
  }

  async function handleVisualizar(v: OrcamentoVersaoResumo) {
    setVisualizando(v)
    setSnapshotVisualizado(null)
    setCarregandoSnapshot(true)
    try {
      const snap = await buscarSnapshotVersao(v.id)
      setSnapshotVisualizado(snap)
    } finally {
      setCarregandoSnapshot(false)
    }
  }

  async function handleConfirmarRestaurar() {
    if (!restaurando || executandoRestore) return
    setExecutandoRestore(true)
    setErroRestore(null)
    try {
      await restaurarVersao(orcamentoId, restaurando.id)
      router.push(`/orcamentos/${orcamentoId}/planilha`)
      router.refresh()
    } catch (e) {
      setErroRestore(e instanceof Error ? e.message : 'Erro ao restaurar versão')
    } finally {
      setExecutandoRestore(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Versões</h1>
          <p className="mt-1 text-sm text-gray-500">
            Histórico de snapshots do orçamento. Nenhuma versão é apagada automaticamente.
          </p>
        </div>
        <button
          onClick={() => setShowCriar(true)}
          disabled={!!fetchError}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Criar versão
        </button>
      </div>

      {fetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">Não foi possível carregar as versões</p>
          <p className="mt-1 font-mono text-xs text-red-500">{fetchError}</p>
          <p className="mt-2 text-xs text-red-600">
            Se o erro mencionar a tabela <code className="font-mono">orcamento_versoes</code>, a migração
            <code className="mx-1 font-mono">20260706000000_orcamento_versoes.sql</code>
            ainda não foi aplicada neste banco Supabase — rode-a no SQL Editor do projeto.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium text-gray-500">Mensagem</th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-48">Autor</th>
              <th className="px-4 py-2.5 text-left font-medium text-gray-500 w-40">Data</th>
              <th className="px-4 py-2.5 text-right font-medium text-gray-500 w-56">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {versoes.map(v => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-900">
                  {v.mensagem}
                  {v.origem === 'pre_restore' && (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                      backup automático
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{v.autor_email ?? '—'}</td>
                <td className="px-4 py-2.5 text-gray-600 tabular-nums" suppressHydrationWarning>{fmtData(v.criado_em)}</td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => handleVisualizar(v)}
                    className="mr-2 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    Visualizar
                  </button>
                  <button
                    onClick={() => { setRestaurando(v); setErroRestore(null) }}
                    className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    Restaurar
                  </button>
                </td>
              </tr>
            ))}
            {versoes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">
                  Nenhuma versão criada ainda. Clique em &quot;Criar versão&quot; para registrar o estado atual do orçamento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Criar versão */}
      {showCriar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-blue-600 px-6 py-4">
              <h2 className="text-base font-bold text-white">Criar versão</h2>
              <p className="text-xs text-blue-100 mt-0.5">Salva um snapshot completo do orçamento atual.</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <label className="block text-xs font-medium text-gray-600">
                Mensagem <span className="text-red-500">*</span>
              </label>
              <textarea
                autoFocus
                value={mensagem}
                onChange={e => setMensagem(e.target.value)}
                rows={3}
                placeholder="Ex.: Fechamento da revisão 1 para aprovação do cliente"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
              {erro && <p className="text-xs text-red-600">{erro}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t bg-gray-50 px-6 py-4">
              <button
                onClick={() => { setShowCriar(false); setErro(null) }}
                disabled={criando}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleCriar}
                disabled={criando || !mensagem.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {criando ? 'Salvando...' : 'Criar versão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Visualizar */}
      {visualizando && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-gray-800 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">{visualizando.mensagem}</h2>
                <p className="text-xs text-gray-400 mt-0.5" suppressHydrationWarning>{fmtData(visualizando.criado_em)} · {visualizando.autor_email ?? 'autor desconhecido'}</p>
              </div>
              <button onClick={() => setVisualizando(null)} className="text-gray-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
              {carregandoSnapshot || !snapshotVisualizado ? (
                <p className="text-sm text-gray-400">Carregando...</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Planilhas', value: snapshotVisualizado.planilhas.length },
                      { label: 'Itens (EAP)', value: snapshotVisualizado.estrutura.length },
                      { label: 'Composições', value: snapshotVisualizado.composicoes.length },
                      { label: 'Insumos', value: snapshotVisualizado.insumos.length },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-lg border bg-gray-50 p-3 text-center">
                        <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
                        <p className="text-xs text-gray-500">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Estrutura (EAP)</p>
                    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm max-h-72 overflow-y-auto">
                      {arvorePreview.length > 0 ? <ArvorePreview nodes={arvorePreview} /> : <p className="text-gray-400">Estrutura vazia.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t bg-gray-50 px-6 py-4">
              <button
                onClick={() => setVisualizando(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar restauração */}
      {restaurando && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-amber-500 px-6 py-4">
              <h2 className="text-base font-bold text-white">Restaurar versão</h2>
            </div>
            <div className="px-6 py-5 space-y-2">
              <p className="text-sm text-gray-600 leading-relaxed">
                Isso substituirá a planilha, composições, insumos e configurações atuais do orçamento
                pelo estado salvo em <strong>&quot;{restaurando.mensagem}&quot;</strong> ({fmtData(restaurando.criado_em)}).
              </p>
              <p className="text-sm text-gray-600 leading-relaxed">
                Uma versão de segurança com o estado atual será criada automaticamente antes da restauração,
                então nada é perdido — mas essa ação altera o orçamento imediatamente.
              </p>
              {erroRestore && <p className="text-xs text-red-600">{erroRestore}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t bg-gray-50 px-6 py-4">
              <button
                onClick={() => setRestaurando(null)}
                disabled={executandoRestore}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarRestaurar}
                disabled={executandoRestore}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {executandoRestore ? 'Restaurando...' : 'Restaurar versão'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
