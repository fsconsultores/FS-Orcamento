'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Eye, RotateCcw, History, GitCommit, GitBranchPlus, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react'
import type { OrcamentoVersaoResumo, VersaoSnapshotV1 } from '@/lib/orcamento/versoes'
import type { RevisaoResumo } from '@/lib/orcamento/revisoes'
import { criarVersao, restaurarVersao, buscarSnapshotVersao, criarOrcamentoDeVersao, criarRevisaoAction } from './versoes-action'
import { ComparacaoPrecos } from './comparacao-precos'
import { formatCurrency } from '@/lib/costs'
import { PageHeader } from '@/components/ui/toolbar'
import { Timeline, TimelineItem } from '@/components/ui/timeline'
import { Badge } from '@/components/ui/badge'
import { Button, IconButton } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Modal, ConfirmDialog } from '@/components/ui/modal'
import { Input, Textarea } from '@/components/ui/input'
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
  orcamentoNome,
  versoesIniciais,
  fetchError,
  usuarioAtualEmail,
  revisoesIniciais,
  revisoesFetchError,
}: {
  orcamentoId: string
  orcamentoNome: string
  versoesIniciais: OrcamentoVersaoResumo[]
  fetchError?: string
  usuarioAtualEmail?: string | null
  revisoesIniciais: RevisaoResumo[]
  revisoesFetchError?: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const toast = useToast()

  // Histórico de snapshots (antigo "Versões") fica secundário/recolhido por
  // padrão — Revisões é o fluxo principal agora, ver auditoria de revisões.
  const [mostrarSnapshots, setMostrarSnapshots] = useState(false)
  const [criandoRevisao, setCriandoRevisao] = useState(false)
  // Abre em "Manuais" — backup automático (origem='pre_restore', criado sem
  // pedir nada a ninguém antes de cada Restaurar) não deve aparecer misturado
  // com as revisões reais por padrão; continua a 1 clique pra quem precisar
  // recuperar algo por ele.
  const [filtroOrigem, setFiltroOrigem] = useState<FiltroOrigem>('manual')
  const [somenteMinhas, setSomenteMinhas] = useState(false)

  const versoes = useMemo(() => {
    return versoesIniciais.filter(v => {
      if (filtroOrigem === 'manual' && v.origem !== 'manual') return false
      if (filtroOrigem === 'backup_automatico' && v.origem !== 'pre_restore') return false
      if (somenteMinhas && (!usuarioAtualEmail || v.autor_email !== usuarioAtualEmail)) return false
      return true
    })
  }, [versoesIniciais, filtroOrigem, somenteMinhas, usuarioAtualEmail])

  // Número de revisão = posição cronológica entre as versões manuais (mais
  // antiga = Revisão 1), nunca persistido — computado aqui porque nenhuma
  // versão é apagada (ver comentário na migração), então a ordem é estável
  // pra sempre. Backup automático (pre_restore) não entra nessa numeração:
  // não é uma revisão de verdade, é uma rede de segurança interna.
  const revisaoPorId = useMemo(() => {
    const manuais = versoesIniciais
      .filter(v => v.origem === 'manual')
      .slice()
      .sort((a, b) => new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime())
    const map = new Map<string, number>()
    manuais.forEach((v, i) => map.set(v.id, i + 1))
    return map
  }, [versoesIniciais])

  const [showCriar, setShowCriar] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [visualizando, setVisualizando] = useState<OrcamentoVersaoResumo | null>(null)
  const [snapshotVisualizado, setSnapshotVisualizado] = useState<VersaoSnapshotV1 | null>(null)
  const [carregandoSnapshot, setCarregandoSnapshot] = useState(false)

  const [restaurando, setRestaurando] = useState<OrcamentoVersaoResumo | null>(null)
  const [executandoRestore, setExecutandoRestore] = useState(false)

  const [criandoOrcamentoDe, setCriandoOrcamentoDe] = useState<OrcamentoVersaoResumo | null>(null)
  const [formNovoOrcamento, setFormNovoOrcamento] = useState({ nome_obra: '', codigo: '', cliente: '', descricao: '', mensagemInicial: '' })
  const [executandoNovoOrcamento, setExecutandoNovoOrcamento] = useState(false)
  const [erroNovoOrcamento, setErroNovoOrcamento] = useState<string | null>(null)

  const arvorePreview = useMemo(
    () => (snapshotVisualizado ? montarArvorePreview(snapshotVisualizado.estrutura) : []),
    [snapshotVisualizado]
  )

  async function handleCriarRevisao() {
    if (criandoRevisao) return
    setCriandoRevisao(true)
    try {
      const resultado = await criarRevisaoAction(orcamentoId)
      toast.show(`Revisão ${resultado.numero_revisao} criada.`)
      startTransition(() => {
        router.push(`/orcamentos/${resultado.id}/planilha`)
        router.refresh()
      })
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível criar a revisão. Tente novamente.', 'error')
      setCriandoRevisao(false)
    }
  }

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

  function handleAbrirCriarOrcamento(v: OrcamentoVersaoResumo) {
    setCriandoOrcamentoDe(v)
    setErroNovoOrcamento(null)
    setFormNovoOrcamento({
      nome_obra: `${orcamentoNome} (cópia)`,
      codigo: '',
      cliente: '',
      descricao: '',
      mensagemInicial: `Orçamento criado a partir da versão "${v.mensagem}" do orçamento "${orcamentoNome}".`,
    })
    // Preenche o Cliente com o valor congelado naquela versão — melhor
    // esforço, não bloqueia a abertura do modal (o campo já nasce editável).
    buscarSnapshotVersao(v.id)
      .then(snap => setFormNovoOrcamento(prev => ({ ...prev, cliente: snap.orcamento.cliente ?? '' })))
      .catch(() => {})
  }

  async function handleConfirmarCriarOrcamento() {
    if (!criandoOrcamentoDe || executandoNovoOrcamento) return
    if (!formNovoOrcamento.nome_obra.trim()) { setErroNovoOrcamento('Informe o nome do novo orçamento.'); return }
    if (!formNovoOrcamento.mensagemInicial.trim()) { setErroNovoOrcamento('Informe a mensagem inicial.'); return }
    setExecutandoNovoOrcamento(true)
    setErroNovoOrcamento(null)
    try {
      const result = await criarOrcamentoDeVersao(orcamentoId, criandoOrcamentoDe.id, {
        nome_obra: formNovoOrcamento.nome_obra,
        codigo: formNovoOrcamento.codigo || null,
        cliente: formNovoOrcamento.cliente || null,
        descricao: formNovoOrcamento.descricao || null,
        mensagemInicial: formNovoOrcamento.mensagemInicial,
      })
      toast.show(`Orçamento "${result.nome_obra}" criado.`)
      startTransition(() => {
        router.push(`/orcamentos/${result.id}/planilha`)
        router.refresh()
      })
    } catch (e) {
      setErroNovoOrcamento(e instanceof Error ? e.message : 'Não foi possível criar o orçamento. Tente novamente.')
      setExecutandoNovoOrcamento(false)
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
        title="Revisões"
        description={`${orcamentoNome} — cada revisão é uma cópia completa e independente. Editar uma nunca afeta as outras.`}
        actions={
          <Button onClick={handleCriarRevisao} loading={criandoRevisao} disabled={!!revisoesFetchError} icon={<GitBranchPlus size={15} />}>
            Nova revisão
          </Button>
        }
      />

      {revisoesFetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">Não foi possível carregar as revisões</p>
          <p className="mt-1 font-mono text-xs text-red-500">{revisoesFetchError}</p>
          <p className="mt-2 text-xs text-red-600">
            A migração <code className="mx-1 font-mono">20260828000000_orcamento_revisoes.sql</code>
            ainda não foi aplicada neste banco Supabase — rode-a no SQL Editor do projeto.
          </p>
        </div>
      )}

      {!revisoesFetchError && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-2">
            {revisoesIniciais.map(r => {
              const ehAqui = r.id === orcamentoId
              return (
                <div
                  key={r.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                    ehAqui ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      ehAqui ? 'bg-primary-700 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {r.numero_revisao}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium text-gray-900">
                        Revisão {r.numero_revisao}
                        {ehAqui && <Badge variant="brand">você está aqui</Badge>}
                        {r.ehAtual && !ehAqui && <Badge variant="success">mais recente</Badge>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
                        <span className="tabular-nums" suppressHydrationWarning>{fmtData(r.criado_em)}</span>
                        <span>·</span>
                        <span>{r.autor_email ?? 'autor desconhecido'}</span>
                        {r.ultimo_acesso && (
                          <>
                            <span>·</span>
                            <span>último acesso <span className="tabular-nums" suppressHydrationWarning>{fmtData(r.ultimo_acesso)}</span></span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  {ehAqui ? (
                    <span className="text-xs font-medium text-primary-700">Revisão aberta</span>
                  ) : (
                    <Link href={`/orcamentos/${r.id}/planilha`}>
                      <Button variant="outline" size="sm" icon={<ArrowRight size={13} />}>Abrir</Button>
                    </Link>
                  )}
                </div>
              )
            })}
            {revisoesIniciais.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-gray-400">Nenhuma revisão encontrada.</p>
            )}
          </div>
        </div>
      )}

      {!revisoesFetchError && revisoesIniciais.length > 1 && (
        <ComparacaoPrecos orcamentoId={orcamentoId} />
      )}

      <button
        onClick={() => setMostrarSnapshots(v => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
      >
        {mostrarSnapshots ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Histórico de snapshots (legado)
      </button>

      {mostrarSnapshots && (
      <>
      <p className="text-xs text-gray-400 -mt-2">
        Sistema anterior de checkpoints — salva um retrato do orçamento sem criar uma revisão nova. Mantido só pra recuperação de casos antigos.
      </p>
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => setShowCriar(true)} disabled={!!fetchError} icon={<Plus size={14} />}>
          Criar snapshot
        </Button>
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
                      {v.origem === 'manual' && (
                        <span className="text-primary-700">Revisão {revisaoPorId.get(v.id)} — </span>
                      )}
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
                      Ver resumo
                    </Button>
                    <Button variant="outline" size="sm" icon={<RotateCcw size={13} />} onClick={() => setRestaurando(v)}>
                      Restaurar
                    </Button>
                    <Button variant="outline" size="sm" icon={<GitBranchPlus size={13} />} onClick={() => handleAbrirCriarOrcamento(v)}>
                      Criar orçamento
                    </Button>
                  </div>
                </div>
              </TimelineItem>
            ))}
          </Timeline>
        </div>
      )}
      </>
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
            placeholder="Ex.: Fechamento para aprovação do cliente"
            error={erro ?? undefined}
          />
        </div>
      </Modal>

      {/* Modal: Resumo da revisão */}
      <Modal
        open={!!visualizando}
        onClose={() => setVisualizando(null)}
        title={
          visualizando
            ? (visualizando.origem === 'manual' ? `Revisão ${revisaoPorId.get(visualizando.id)} — ${visualizando.mensagem}` : visualizando.mensagem)
            : ''
        }
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
                {/* Fora do StatRow (grade de 4 colunas, pensada pra números curtos) —
                    um valor em R$ não cabe legível dividindo espaço com "Planilhas: 2",
                    então ganha destaque próprio, largura cheia. */}
                <div className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3">
                  <p className="text-xs font-medium text-primary-700">Total geral</p>
                  <p className="text-2xl font-bold tabular-nums text-primary-900">
                    {formatCurrency(snapshotVisualizado.planilhas.reduce((s, p) => s + (p.total_com_bdi ?? 0), 0))}
                  </p>
                </div>
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

      {/* Modal: Criar novo orçamento a partir desta versão */}
      <Modal
        open={!!criandoOrcamentoDe}
        onClose={() => { if (!executandoNovoOrcamento) setCriandoOrcamentoDe(null) }}
        title="Criar novo orçamento desta versão"
        size="md"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setCriandoOrcamentoDe(null)} disabled={executandoNovoOrcamento}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleConfirmarCriarOrcamento} loading={executandoNovoOrcamento} disabled={!formNovoOrcamento.nome_obra.trim()}>
              Criar orçamento
            </Button>
          </>
        }
      >
        {criandoOrcamentoDe && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Cria um orçamento novo e completamente independente com o estado salvo em
              &quot;{criandoOrcamentoDe.mensagem}&quot;. O orçamento e as versões de &quot;{orcamentoNome}&quot; não são alterados.
            </p>
            <Input
              label="Nome do novo orçamento"
              required
              value={formNovoOrcamento.nome_obra}
              onChange={e => setFormNovoOrcamento(prev => ({ ...prev, nome_obra: e.target.value }))}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Código"
                help="Opcional"
                value={formNovoOrcamento.codigo}
                onChange={e => setFormNovoOrcamento(prev => ({ ...prev, codigo: e.target.value }))}
              />
              <Input
                label="Cliente"
                value={formNovoOrcamento.cliente}
                onChange={e => setFormNovoOrcamento(prev => ({ ...prev, cliente: e.target.value }))}
              />
            </div>
            <Textarea
              label="Descrição"
              help="Opcional — fica registrada na auditoria deste orçamento"
              rows={2}
              value={formNovoOrcamento.descricao}
              onChange={e => setFormNovoOrcamento(prev => ({ ...prev, descricao: e.target.value }))}
            />
            <Textarea
              label="Mensagem inicial"
              required
              help="Mensagem da primeira versão do orçamento novo"
              rows={2}
              value={formNovoOrcamento.mensagemInicial}
              onChange={e => setFormNovoOrcamento(prev => ({ ...prev, mensagemInicial: e.target.value }))}
              error={erroNovoOrcamento ?? undefined}
            />
          </div>
        )}
      </Modal>
    </div>
  )
}
