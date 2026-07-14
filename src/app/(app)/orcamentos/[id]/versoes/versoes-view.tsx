'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Eye, RotateCcw, History, GitCommit } from 'lucide-react'
import type { OrcamentoVersaoResumo, VersaoSnapshotV1 } from '@/lib/orcamento/versoes'
import { criarVersao, restaurarVersao, buscarSnapshotVersao } from './versoes-action'
import { PageHeader } from '@/components/ui/toolbar'
import { Timeline, TimelineItem } from '@/components/ui/timeline'
import { Badge } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Modal, ConfirmDialog } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/input'
import { StatRow, StatCard } from '@/components/ui/stat-row'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'

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

type FiltroOrigem = 'todas' | 'manual' | 'backup_automatico'

export function VersoesView({
  orcamentoId,
  versoesIniciais,
  fetchError,
  usuarioAtualEmail,
}: {
  orcamentoId: string
  versoesIniciais: OrcamentoVersaoResumo[]
  fetchError?: string
  usuarioAtualEmail?: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const toast = useToast()
  const [filtroOrigem, setFiltroOrigem] = useState<FiltroOrigem>('todas')
  const [somenteMinhas, setSomenteMinhas] = useState(false)

  const versoes = useMemo(() => {
    return versoesIniciais.filter(v => {
      if (filtroOrigem === 'manual' && v.origem !== 'manual') return false
      if (filtroOrigem === 'backup_automatico' && v.origem !== 'pre_restore') return false
      if (somenteMinhas && (!usuarioAtualEmail || v.autor_email !== usuarioAtualEmail)) return false
      return true
    })
  }, [versoesIniciais, filtroOrigem, somenteMinhas, usuarioAtualEmail])

  const [showCriar, setShowCriar] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [visualizando, setVisualizando] = useState<OrcamentoVersaoResumo | null>(null)
  const [snapshotVisualizado, setSnapshotVisualizado] = useState<VersaoSnapshotV1 | null>(null)
  const [carregandoSnapshot, setCarregandoSnapshot] = useState(false)

  const [restaurando, setRestaurando] = useState<OrcamentoVersaoResumo | null>(null)
  const [executandoRestore, setExecutandoRestore] = useState(false)

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
      toast.show('Versão criada.')
      startTransition(() => router.refresh())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar a versão. Tente novamente.')
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
    try {
      await restaurarVersao(orcamentoId, restaurando.id)
      startTransition(() => {
        router.push(`/orcamentos/${orcamentoId}/planilha`)
        router.refresh()
      })
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível restaurar a versão. Tente novamente.', 'error')
      setExecutandoRestore(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Versões"
        description="Histórico de snapshots do orçamento. Nenhuma versão é apagada automaticamente."
        actions={
          <Button onClick={() => setShowCriar(true)} disabled={!!fetchError} icon={<Plus size={15} />}>
            Criar versão
          </Button>
        }
      />

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

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-white p-0.5 text-xs">
          {([
            ['todas', 'Todas'],
            ['manual', 'Manuais'],
            ['backup_automatico', 'Backup automático'],
          ] as [FiltroOrigem, string][]).map(([valor, label]) => (
            <button
              key={valor}
              onClick={() => setFiltroOrigem(valor)}
              className={`rounded px-2.5 py-1 font-medium transition-colors ${
                filtroOrigem === valor ? 'bg-primary-700 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
          <Checkbox
            checked={somenteMinhas}
            onChange={e => setSomenteMinhas(e.target.checked)}
            disabled={!usuarioAtualEmail}
          />
          Criadas por mim
        </label>
        {somenteMinhas && !usuarioAtualEmail && (
          <span className="text-xs text-gray-400">(não foi possível identificar seu usuário)</span>
        )}
      </div>

      {versoes.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <EmptyState
            icon={<History size={20} />}
            title={versoesIniciais.length === 0 ? 'Nenhuma versão criada ainda' : 'Nenhuma versão encontrada'}
            description={
              versoesIniciais.length === 0
                ? 'Clique em "Criar versão" para registrar o estado atual do orçamento.'
                : 'Ajuste os filtros para ver outras versões.'
            }
            action={versoesIniciais.length === 0 ? (
              <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowCriar(true)} disabled={!!fetchError}>
                Criar versão
              </Button>
            ) : undefined}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <Timeline>
            {versoes.map((v, i) => (
              <TimelineItem
                key={v.id}
                icon={<GitCommit size={14} />}
                tone={v.origem === 'pre_restore' ? 'warning' : 'primary'}
                isLast={i === versoes.length - 1}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {v.mensagem}
                      {v.origem === 'pre_restore' && (
                        <Badge variant="warning" className="ml-2">backup automático</Badge>
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
                      <span className="font-mono">{v.id.slice(0, 7)}</span>
                      <span>·</span>
                      <span>{v.autor_email ?? 'autor desconhecido'}</span>
                      <span>·</span>
                      <span className="tabular-nums" suppressHydrationWarning>{fmtData(v.criado_em)}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button variant="outline" size="sm" icon={<Eye size={13} />} onClick={() => handleVisualizar(v)}>
                      Visualizar
                    </Button>
                    <Button variant="outline" size="sm" icon={<RotateCcw size={13} />} onClick={() => setRestaurando(v)}>
                      Restaurar
                    </Button>
                  </div>
                </div>
              </TimelineItem>
            ))}
          </Timeline>
        </div>
      )}

      {/* Modal: Criar versão */}
      <Modal
        open={showCriar}
        onClose={() => { if (!criando) { setShowCriar(false); setErro(null) } }}
        title="Criar versão"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => { setShowCriar(false); setErro(null) }} disabled={criando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCriar} loading={criando} disabled={!mensagem.trim()}>
              Criar versão
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Salva um snapshot completo do orçamento atual.</p>
          <Textarea
            autoFocus
            label="Mensagem"
            required
            value={mensagem}
            onChange={e => setMensagem(e.target.value)}
            rows={3}
            placeholder="Ex.: Fechamento da revisão 1 para aprovação do cliente"
            error={erro ?? undefined}
          />
        </div>
      </Modal>

      {/* Modal: Visualizar */}
      <Modal
        open={!!visualizando}
        onClose={() => setVisualizando(null)}
        title={visualizando?.mensagem ?? ''}
        size="lg"
        footer={<Button variant="outline" size="sm" onClick={() => setVisualizando(null)}>Fechar</Button>}
      >
        {visualizando && (
          <div className="space-y-4">
            <p className="text-xs text-gray-400" suppressHydrationWarning>
              {fmtData(visualizando.criado_em)} · {visualizando.autor_email ?? 'autor desconhecido'}
            </p>
            {carregandoSnapshot || !snapshotVisualizado ? (
              <p className="text-sm text-gray-400">Carregando…</p>
            ) : (
              <>
                <StatRow>
                  <StatCard label="Planilhas" value={snapshotVisualizado.planilhas.length} />
                  <StatCard label="Itens (EAP)" value={snapshotVisualizado.estrutura.length} />
                  <StatCard label="Composições" value={snapshotVisualizado.composicoes.length} />
                  <StatCard label="Insumos" value={snapshotVisualizado.insumos.length} />
                </StatRow>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Estrutura (EAP)</p>
                  <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-sm">
                    {arvorePreview.length > 0 ? <ArvorePreview nodes={arvorePreview} /> : <p className="text-gray-400">Estrutura vazia.</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Modal: Confirmar restauração */}
      <ConfirmDialog
        open={!!restaurando}
        onClose={() => setRestaurando(null)}
        onConfirm={handleConfirmarRestaurar}
        title="Restaurar versão"
        danger
        loading={executandoRestore}
        confirmLabel="Restaurar versão"
        description={
          restaurando ? (
            <>
              Isso substituirá a planilha, composições, insumos e configurações atuais do orçamento
              pelo estado salvo em &quot;{restaurando.mensagem}&quot; ({fmtData(restaurando.criado_em)}).
              {' '}Uma versão de segurança com o estado atual será criada automaticamente antes da
              restauração, então nada é perdido — mas essa ação altera o orçamento imediatamente.
            </>
          ) : ''
        }
      />
    </div>
  )
}
