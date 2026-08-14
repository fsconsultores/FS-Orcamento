'use client'

import { useState, useEffect, useRef, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { upsertAvulsoInsumo } from '@/lib/orcamento/insumos'
import { recalcularAutoAction } from '../planilha/calcular-action'
import { atualizarPrecoInsumoAction } from '../atualizar-preco-insumo-action'
import { aplicarSugestoesCotacaoAction } from '../aplicar-sugestoes-cotacao-action'
import type { OrcamentoInsumo, SugestaoCotacao } from '@/lib/orcamento'
import { registrarHistorico } from '@/lib/log'
import { ClientPagination } from '@/components/client-pagination'
import { Truck, CalendarDays, Sparkles } from 'lucide-react'
import { EstimadoBadge } from '@/components/estimado-badge'
import { CotacaoInsumoModal, type CotacaoSalva } from '@/components/cotacao-insumo-modal'
import { InlineInput, InlineSelect } from '@/components/ui/inline-edit'
import { formatCurrency } from '@/lib/costs'
import { formatDateOnly, formatDateShort } from '@/lib/format-date'
import { ComposicoesModal, type ComposicoesModalState } from './composicoes-modal'
import { HistoricoPrecoModal, type HistoricoModal, type HistoricoPreco } from './historico-preco-modal'
import { getInsumosDetalhadoAction } from './actions'
import { ExportInsumoModeloButton } from '@/components/export-insumo-modelo-button'
import { ConfirmDialog } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'

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

type EditableField = 'grupo' | 'base'

interface Editing {
  id: string
  field: EditableField
  value: string
}

type SortField = 'fornecedor' | 'data_cotacao' | 'custo'
type SortDir = 'asc' | 'desc'

type FiltroCotacao = 'todos' | 'sem_fornecedor' | 'sem_data' | 'hoje' | 'ultimos_30' | string /* fornecedor específico */

function fmtMoeda(value: number | null | undefined): string {
  if (value == null) return '—'
  return formatCurrency(value)
}

function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

const fmtDataCurta = formatDateShort

// data_cotacao é DATE puro ('AAAA-MM-DD', sem hora) — formatDateOnly evita o
// mesmo problema de fuso que new Date(string) teria (UTC meia-noite poderia
// exibir o dia anterior em fusos negativos).
const fmtDataCotacao = formatDateOnly

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function SortIcon({ field, sortField, sortDir }: { field: 'fornecedor' | 'data_cotacao' | 'custo'; sortField: 'fornecedor' | 'data_cotacao' | 'custo' | null; sortDir: 'asc' | 'desc' }) {
  if (sortField !== field) return <span className="inline-block w-2.5 text-gray-300">↕</span>
  return <span className="inline-block w-2.5 text-gray-600">{sortDir === 'asc' ? '↑' : '↓'}</span>
}

export function OrcamentoInsumosTable({
  initialInsumos,
  orcamentoId,
}: {
  /** Só avulsos — insumos embutidos em composições sem avulso equivalente chegam depois, em background. */
  initialInsumos: OrcamentoInsumo[]
  orcamentoId: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const toast = useToast()
  const [insumos, setInsumos] = useState(initialInsumos)
  /** Sugestão de preço por código (cotações de OUTRAS obras) — carregada em background, ver useEffect abaixo. */
  const [sugestoesState, setSugestoesState] = useState<Record<string, SugestaoCotacao>>({})
  const [query, setQuery] = useState('')
  const [filtroUso, setFiltroUso] = useState<'todos' | 'usados' | 'nao_usados'>('todos')
  const [filtroOrigem, setFiltroOrigem] = useState<'todos' | 'proprios' | 'importados'>('todos')
  const [somenteSugestao, setSomenteSugestao] = useState(false)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [aplicandoSugestoes, setAplicandoSugestoes] = useState(false)
  const [codigosUtilizados, setCodigosUtilizados] = useState<string[]>([])
  const usadosSet = useMemo(() => new Set(codigosUtilizados), [codigosUtilizados])
  const [removendoBase, setRemovendoBase] = useState<string | null>(null)
  const [confirmarExcluir, setConfirmarExcluir] = useState<{ id: string; codigo: string } | null>(null)
  const [confirmarExcluirHistorico, setConfirmarExcluirHistorico] = useState<HistoricoPreco | null>(null)
  const [confirmarLimparAvulsos, setConfirmarLimparAvulsos] = useState<{ total: number; avulsos: OrcamentoInsumo[] } | null>(null)
  const [limpandoAvulsos, setLimpandoAvulsos] = useState(false)
  const [baseParaConfirmar, setBaseParaConfirmar] = useState<string | null>(null)

  // Insumos embutidos em composições sem avulso equivalente e o vínculo
  // usado pelo filtro "usados/não utilizados" dependem do grafo completo
  // (caro em orçamentos grandes) — buscados em background, sem bloquear a
  // primeira renderização (ver getInsumosDetalhadoAction). Refaz sempre que
  // `initialInsumos` muda de referência (nova visita/`router.refresh()`),
  // não só na montagem — senão um refresh após limpar/remover base reverte
  // pra "avulsos só" sem nunca re-buscar o resto.
  const [usoStatus, setUsoStatus] = useState<'carregando' | 'pronto' | 'erro'>('carregando')

  useEffect(() => {
    setInsumos(initialInsumos)
    setUsoStatus('carregando')
    let cancelado = false
    getInsumosDetalhadoAction(orcamentoId)
      .then(({ insumosCompletos, codigosUtilizados, sugestoes }) => {
        if (cancelado) return
        setInsumos(prev => {
          const ids = new Set(prev.map(i => i.id))
          const extras = insumosCompletos.filter(i => !ids.has(i.id))
          return extras.length > 0 ? [...prev, ...extras] : prev
        })
        setCodigosUtilizados(codigosUtilizados)
        setSugestoesState(sugestoes)
        setUsoStatus('pronto')
      })
      .catch(err => {
        if (cancelado) return
        console.error('[OrcamentoInsumosTable] erro ao carregar dados completos', err)
        setUsoStatus('erro')
      })
    return () => { cancelado = true }
  }, [orcamentoId, initialInsumos])

  function temSugestao(insumo: OrcamentoInsumo): boolean {
    return insumo.composicao_id === null && insumo.custo === 0 && !!sugestoesState[insumo.codigo]
  }

  // Bases presentes entre os insumos AVULSOS (composicao_id null) — insumos
  // embutidos numa composição são desfeitos junto com ela, na aba Composições.
  const basesPresentesAvulsos = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const ins of insumos) {
      if (ins.composicao_id === null && ins.base) contagem.set(ins.base, (contagem.get(ins.base) ?? 0) + 1)
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1])
  }, [insumos])

  const [currentPage, setCurrentPage] = useState(1)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [composicoesModal, setComposicoesModal] = useState<ComposicoesModalState | null>(null)
  const [historicoModal, setHistoricoModal] = useState<HistoricoModal | null>(null)
  const [cotacaoModal, setCotacaoModal] = useState<OrcamentoInsumo | null>(null)
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filtroCotacao, setFiltroCotacao] = useState<FiltroCotacao>('todos')

  const q = query.trim().toLowerCase()
  const fornecedoresDisponiveis = useMemo(
    () => [...new Set(insumos.map(i => i.fornecedor).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [insumos]
  )

  // Memoizado: sem isso, o filter+toLowerCase rodava a cada render do
  // componente inteiro — inclusive a cada keystroke ao editar uma célula
  // inline (savingId/editing mudando não tem nada a ver com a busca).
  const visible = useMemo(() => {
    const porTexto = q
      ? insumos.filter(ins =>
          ins.codigo.toLowerCase().includes(q) ||
          ins.descricao.toLowerCase().includes(q)
        )
      : insumos
    const porUso = filtroUso === 'todos'
      ? porTexto
      : porTexto.filter(ins => usadosSet.has(ins.codigo) === (filtroUso === 'usados'))

    // base === null: criado direto neste orçamento (formulário "Novo insumo").
    // base !== null: veio de uma importação (guarda o nome da base de origem).
    const porOrigem = filtroOrigem === 'todos'
      ? porUso
      : porUso.filter(ins => (ins.base === null) === (filtroOrigem === 'proprios'))

    const hoje = hojeISO()
    const ha30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const porCotacao = filtroCotacao === 'todos' ? porOrigem
      : filtroCotacao === 'sem_fornecedor' ? porOrigem.filter(i => !i.fornecedor)
      : filtroCotacao === 'sem_data' ? porOrigem.filter(i => !i.data_cotacao)
      : filtroCotacao === 'hoje' ? porOrigem.filter(i => i.data_cotacao === hoje)
      : filtroCotacao === 'ultimos_30' ? porOrigem.filter(i => i.data_cotacao && i.data_cotacao >= ha30dias)
      : porOrigem.filter(i => i.fornecedor === filtroCotacao) // fornecedor específico

    const porSugestao = somenteSugestao ? porCotacao.filter(temSugestao) : porCotacao

    if (!sortField) return porSugestao
    const dir = sortDir === 'asc' ? 1 : -1
    return [...porSugestao].sort((a, b) => {
      if (sortField === 'custo') return (a.custo - b.custo) * dir
      const av = a[sortField] ?? ''
      const bv = b[sortField] ?? ''
      return av.localeCompare(bv, 'pt-BR') * dir
    })
  }, [insumos, q, filtroUso, filtroOrigem, filtroCotacao, somenteSugestao, sugestoesState, sortField, sortDir, usadosSet])

  useEffect(() => { setCurrentPage(1) }, [q, filtroUso, filtroOrigem, filtroCotacao, somenteSugestao, sortField, sortDir])

  const sugeridasVisiveis = useMemo(() => visible.filter(temSugestao), [visible, sugestoesState])
  const todasSugeridasSelecionadas = sugeridasVisiveis.length > 0 && sugeridasVisiveis.every(i => selecionadas.has(i.id))

  function alternarSelecaoTodas() {
    setSelecionadas(prev => {
      if (todasSugeridasSelecionadas) {
        const next = new Set(prev)
        for (const i of sugeridasVisiveis) next.delete(i.id)
        return next
      }
      const next = new Set(prev)
      for (const i of sugeridasVisiveis) next.add(i.id)
      return next
    })
  }

  function alternarSelecao(id: string) {
    setSelecionadas(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAplicarSugestoes() {
    const itens = [...selecionadas]
      .map(id => insumos.find(i => i.id === id))
      .filter((i): i is OrcamentoInsumo => !!i && temSugestao(i))
      .map(i => {
        const s = sugestoesState[i.codigo]
        return { codigo: i.codigo, valor: s.valor, fornecedor: s.fornecedor, dataCotacao: s.data_cotacao, origemOrcamentoNome: s.orcamentoNome }
      })
    if (itens.length === 0) { setSelecionadas(new Set()); return }

    const codigosAplicados = new Set(itens.map(i => i.codigo))
    const insumosAnteriores = insumos
    const sugestoesAnteriores = sugestoesState

    setInsumos(prev => prev.map(ins => {
      if (!codigosAplicados.has(ins.codigo) || ins.composicao_id !== null) return ins
      const s = sugestoesAnteriores[ins.codigo]
      if (!s) return ins
      return { ...ins, custo: s.valor, fornecedor: s.fornecedor, data_cotacao: s.data_cotacao,
        cotacao_observacoes: `Sugestão aplicada de outra obra (${s.orcamentoNome})`, custo_atualizado_em: new Date().toISOString() }
    }))
    setSugestoesState(prev => {
      const next = { ...prev }
      for (const c of codigosAplicados) delete next[c]
      return next
    })
    setSelecionadas(new Set())
    setAplicandoSugestoes(true)
    try {
      await aplicarSugestoesCotacaoAction(orcamentoId, itens)
    } catch (e) {
      setInsumos(insumosAnteriores)
      setSugestoesState(sugestoesAnteriores)
      toast.show(e instanceof Error ? e.message : 'Erro ao aplicar as sugestões. Tente novamente.', 'error')
    } finally {
      setAplicandoSugestoes(false)
    }
  }

  const paged = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  function startEdit(e: React.MouseEvent, id: string, field: EditableField, value: string) {
    e.preventDefault()
    e.stopPropagation()
    if (savingId) return
    setEditing({ id, field, value })
  }

  function cancelEdit() {
    setEditing(null)
  }

  function abrirCotacaoModal(insumo: OrcamentoInsumo) {
    // Mesma guarda que Curva ABC/Planilha/Composição já usam antes de chamar
    // atualizarPrecoInsumoAction — sem ela, uma linha com código vazio (dado
    // legado de importação) deixa a action lançar sem nenhuma edição possível
    // pra corrigir (código não é editável nesta tabela).
    if (!insumo.codigo) {
      toast.show('Este insumo não tem código cadastrado, então não é possível editar o preço/cotação por aqui. Exclua esta linha e recadastre o insumo com um código válido.', 'info')
      return
    }
    setCotacaoModal(insumo)
  }

  async function handleSalvarCotacao(payload: CotacaoSalva) {
    if (!cotacaoModal) return
    const insumo = cotacaoModal

    // Nada mudou — evita gravar uma cotação idêntica só porque o usuário
    // clicou Salvar sem editar nada.
    if (payload.preco === insumo.custo && payload.fornecedor === (insumo.fornecedor ?? null)
      && payload.dataCotacao === (insumo.data_cotacao ?? null) && payload.observacoes === (insumo.cotacao_observacoes ?? null)
      && payload.estimado === (insumo.estimado ?? false) && payload.estimadoMotivo === (insumo.estimado_motivo ?? null)) {
      setCotacaoModal(null)
      return
    }

    const estadoAnterior = { custo: insumo.custo, fornecedor: insumo.fornecedor, data_cotacao: insumo.data_cotacao, cotacao_observacoes: insumo.cotacao_observacoes, estimado: insumo.estimado, estimado_motivo: insumo.estimado_motivo }
    setInsumos(prev => prev.map(ins => ins.codigo === insumo.codigo
      ? { ...ins, custo: payload.preco, fornecedor: payload.fornecedor, data_cotacao: payload.dataCotacao, cotacao_observacoes: payload.observacoes, estimado: payload.estimado, estimado_motivo: payload.estimadoMotivo, custo_atualizado_em: new Date().toISOString() }
      : ins))
    setSavingId(insumo.id)
    try {
      await atualizarPrecoInsumoAction(orcamentoId, insumo.codigo, payload.preco, undefined, payload)
      setCotacaoModal(null)
    } catch (e) {
      setInsumos(prev => prev.map(ins => ins.codigo === insumo.codigo ? { ...ins, ...estadoAnterior } : ins))
      toast.show(e instanceof Error ? e.message : 'Erro ao salvar a cotação. Tente novamente.', 'error')
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

  async function handleDelete() {
    if (!confirmarExcluir) return
    const { id } = confirmarExcluir
    setConfirmarExcluir(null)
    const anterior = insumos
    setDeletingId(id)
    setInsumos(prev => prev.filter(i => i.id !== id))
    const sb = createClient() as any
    const { error } = await sb.from('orcamento_insumos').delete().eq('id', id)
    if (error) {
      setInsumos(anterior)
      toast.show(`Erro ao excluir: ${error.message}`, 'error')
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

  async function openHistoricoModal(insumo: OrcamentoInsumo, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setHistoricoModal({ insumo, loading: true, historico: [], cotacoes: [] })
    const sb = createClient() as any
    const [{ data, error }, { data: cotacoesData, error: cotacoesErr }] = await Promise.all([
      sb.from('orcamento_insumo_historico_precos')
        .select('id, preco_anterior, preco_novo, usuario, created_at, fornecedor, data_cotacao, observacoes')
        .eq('orcamento_id', orcamentoId)
        .eq('codigo', insumo.codigo)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
      // Cotações completas (fornecedor/data/observações) — tabela nova,
      // só populada a partir de edições feitas pelo modal de cotação; entradas
      // de preço anteriores a essa funcionalidade só aparecem na lista acima.
      sb.from('orcamento_insumo_cotacoes')
        .select('id, orcamento_id, codigo, valor, fornecedor, data_cotacao, observacoes, ativa, usuario, created_at, estimado, estimado_motivo')
        .eq('orcamento_id', orcamentoId)
        .eq('codigo', insumo.codigo)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    if (error) console.error('[historico-preco] buscar:', error)
    if (cotacoesErr) console.error('[cotacoes] buscar:', cotacoesErr)
    setHistoricoModal(prev => prev ? { ...prev, loading: false, historico: data ?? [], cotacoes: cotacoesData ?? [] } : null)
  }

  /**
   * Soft delete — pra corrigir um registro lançado sem querer (ex.: preço
   * digitado errado). A linha some do gráfico/lista, mas nunca é apagada de
   * verdade (deleted_at/deleted_by, mesmo padrão de orcamento_insumos) e a
   * própria remoção fica registrada em historico_alteracoes.
   */
  async function excluirHistoricoPreco() {
    const item = confirmarExcluirHistorico
    if (!item || !historicoModal) return
    setConfirmarExcluirHistorico(null)

    setHistoricoModal(prev => prev
      ? { ...prev, historico: prev.historico.filter(h => h.id !== item.id) }
      : null)

    const sb = createClient() as any
    const { data: { user } } = await sb.auth.getUser()
    const { error } = await sb
      .from('orcamento_insumo_historico_precos')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
      .eq('id', item.id)

    if (error) {
      console.error('[historico-preco] excluir:', error)
      setHistoricoModal(prev => prev ? { ...prev, historico: [...prev.historico, item].sort((a, b) => b.created_at.localeCompare(a.created_at)) } : null)
      toast.show('Erro ao remover o registro. Tente novamente.', 'error')
      return
    }

    const codigo = historicoModal.insumo.codigo

    registrarHistorico(sb, {
      orcamentoId,
      entidade: 'insumo',
      tipo: 'sucesso',
      acao: 'excluir_historico_preco',
      mensagem: `Registro de histórico de preço removido do insumo "${codigo}" (${item.preco_anterior ?? '—'} → ${item.preco_novo}, de ${fmtDataHora(item.created_at)})`,
      valorAnterior: item,
    }).catch(console.error)

    // Se não sobrou nenhum registro de histórico pra este insumo, o preço
    // atual não tem mais nenhuma alteração que o sustente — zera, em vez de
    // deixar um valor que não aparece em lugar nenhum do histórico.
    const { count } = await sb
      .from('orcamento_insumo_historico_precos')
      .select('id', { count: 'exact', head: true })
      .eq('orcamento_id', orcamentoId)
      .eq('codigo', codigo)
      .is('deleted_at', null)

    if ((count ?? 0) > 0) return

    const atual = insumos.find(ins => ins.codigo === codigo)
    if (!atual || atual.custo === 0) return

    const custoAnterior = atual.custo
    setInsumos(prev => prev.map(ins => ins.codigo === codigo ? { ...ins, custo: 0 } : ins))
    await upsertAvulsoInsumo(sb, orcamentoId, codigo, 0)
    recalcularAutoAction(orcamentoId).catch(console.error)
    registrarHistorico(sb, {
      orcamentoId,
      entidade: 'insumo',
      tipo: 'info',
      acao: 'zerar_preco_insumo',
      mensagem: `Preço do insumo "${codigo}" resetado para R$ 0,00 — todo o histórico de preço foi removido`,
      valorAnterior: { custo: custoAnterior },
      valorNovo: { custo: 0 },
    }).catch(console.error)
  }

  async function handleClearClick() {
    const sb = createClient() as any

    // Conta direto no banco — não confia no estado local, que pode estar
    // desatualizado se a página não foi recarregada após uma importação/adição.
    const { data: avulsosAtuais, error: countErr } = await sb
      .from('orcamento_insumos')
      .select('id, codigo, descricao, unidade, custo, grupo, base, data_ref, orcamento_id, composicao_id, created_at')
      .eq('orcamento_id', orcamentoId)
      .is('composicao_id', null)
    if (countErr) {
      toast.show(`Erro ao verificar insumos avulsos: ${countErr.message}`, 'error')
      return
    }
    const totalAvulsos = avulsosAtuais?.length ?? 0
    if (totalAvulsos === 0) {
      // Insumos ainda podem aparecer na tabela mesmo com 0 avulsos — são
      // cópias embutidas em composições (têm preço próprio dentro da
      // composição, não são "avulsos"). Este botão nunca mexe nelas; deixa
      // isso explícito aqui porque "Limpar avulsos" sozinho não deixa óbvio
      // por que a lista continua com linhas depois da limpeza.
      toast.show('Não há insumos avulsos (com preço próprio) para remover. Se a lista ainda mostra insumos, eles pertencem a composições — este botão não os apaga.', 'info')
      startTransition(() => router.refresh())
      return
    }
    setConfirmarLimparAvulsos({ total: totalAvulsos, avulsos: avulsosAtuais })
  }

  async function handleClear() {
    if (!confirmarLimparAvulsos) return
    const { avulsos: avulsosAtuais } = confirmarLimparAvulsos
    setConfirmarLimparAvulsos(null)
    setLimpandoAvulsos(true)
    const sb = createClient() as any

    const { error, count } = await sb
      .from('orcamento_insumos')
      .delete({ count: 'exact' })
      .eq('orcamento_id', orcamentoId)
      .is('composicao_id', null)
    if (error) {
      toast.show(`Erro ao limpar insumos: ${error.message}`, 'error')
      setLimpandoAvulsos(false)
      startTransition(() => router.refresh())
      return
    }
    if (!count) {
      toast.show('Nenhum insumo foi removido no banco de dados (0 linhas afetadas). Os dados não foram alterados — entre em contato com o suporte para investigar.', 'error')
      setLimpandoAvulsos(false)
      startTransition(() => router.refresh())
      return
    }
    setInsumos(prev => prev.filter(i => i.composicao_id !== null))
    registrarHistorico(sb, {
      orcamentoId,
      entidade: 'insumo',
      tipo: 'info',
      acao: 'limpar_insumos_avulsos',
      mensagem: `${count} insumo(s) avulso(s) removido(s) do orçamento`,
      detalhes: { insumos_apagados: avulsosAtuais },
    }).catch(console.error)
    toast.show(`${count} insumo(s) avulso(s) removido(s) com sucesso.`)
    setLimpandoAvulsos(false)
    startTransition(() => router.refresh())
  }

  /**
   * Desfaz uma importação específica: remove só os insumos avulsos que
   * vieram daquela base, sem mexer nos avulsos de outras bases nem nos
   * insumos embutidos em composições (esses são desfeitos junto com a
   * composição, na aba Composições — ver handleRemoverBase de lá).
   */
  async function handleRemoverBase() {
    const base = baseParaConfirmar
    if (!base) return
    const qtd = insumos.filter(ins => ins.composicao_id === null && ins.base === base).length
    setBaseParaConfirmar(null)
    if (qtd === 0) return

    setRemovendoBase(base)
    const sb = createClient() as any
    const { error, count } = await sb
      .from('orcamento_insumos')
      .delete({ count: 'exact' })
      .eq('orcamento_id', orcamentoId)
      .eq('base', base)
      .is('composicao_id', null)
    if (error) {
      toast.show(`Erro ao remover a base "${base}": ${error.message}`, 'error')
      setRemovendoBase(null)
      return
    }
    setInsumos(prev => prev.filter(ins => !(ins.composicao_id === null && ins.base === base)))
    registrarHistorico(sb, {
      orcamentoId,
      entidade: 'insumo',
      tipo: 'info',
      acao: 'remover_base_importada',
      mensagem: `${count ?? qtd} insumo(s) avulso(s) da base "${base}" removido(s) do orçamento`,
    }).catch(console.error)
    setRemovendoBase(null)
  }

  async function handleExport() {
    const XLSX = await import('xlsx')
    const rows = insumos.map(ins => ({
      'Código': ins.codigo,
      'Descrição': ins.descricao,
      'Unidade': ins.unidade,
      'Custo': ins.custo,
      'Fornecedor': ins.fornecedor ?? '',
      'Data Cotação': ins.data_cotacao ? fmtDataCotacao(ins.data_cotacao) : '',
      'Observações': ins.cotacao_observacoes ?? '',
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
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input type="search" placeholder="Buscar por código ou descrição..."
            value={query} onChange={e => setQuery(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex gap-1">
          {([
            { v: 'todos', label: 'Todos' },
            { v: 'usados', label: 'Utilizados no projeto' },
            { v: 'nao_usados', label: 'Não utilizados' },
          ] as const).map(({ v, label }) => {
            const disabled = v !== 'todos' && usoStatus !== 'pronto'
            return (
              <button
                key={v}
                onClick={() => setFiltroUso(v)}
                disabled={disabled}
                title={disabled ? 'Carregando dados de uso…' : undefined}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  filtroUso === v
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="flex gap-1">
          {([
            { v: 'todos', label: 'Todos' },
            { v: 'proprios', label: 'Criados no projeto' },
            { v: 'importados', label: 'Importados de base' },
          ] as const).map(({ v, label }) => (
            <button
              key={v}
              onClick={() => setFiltroOrigem(v)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filtroOrigem === v
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {sugeridasVisiveis.length > 0 && (
          <button
            onClick={() => setSomenteSugestao(v => !v)}
            title="Insumos avulsos sem preço com uma cotação já registrada em outra obra para o mesmo código"
            className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              somenteSugestao
                ? 'bg-amber-500 border-amber-500 text-white'
                : 'bg-white border-amber-300 text-amber-700 hover:border-amber-400'
            }`}
          >
            <Sparkles size={12} />
            Com sugestão ({sugeridasVisiveis.length})
          </button>
        )}
        <select
          value={filtroCotacao}
          onChange={e => setFiltroCotacao(e.target.value)}
          className="rounded-md border border-gray-300 px-2.5 py-2 text-xs text-gray-600 outline-none focus:border-blue-500"
          title="Filtrar por cotação"
        >
          <option value="todos">Cotação: todos</option>
          <option value="sem_fornecedor">Sem fornecedor</option>
          <option value="sem_data">Sem data</option>
          <option value="hoje">Cotados hoje</option>
          <option value="ultimos_30">Últimos 30 dias</option>
          {fornecedoresDisponiveis.length > 0 && (
            <optgroup label="Fornecedor específico">
              {fornecedoresDisponiveis.map(f => <option key={f} value={f}>{f}</option>)}
            </optgroup>
          )}
        </select>
        {basesPresentesAvulsos.length > 0 && (
          <select
            value=""
            onChange={(e) => { if (e.target.value) setBaseParaConfirmar(e.target.value); e.target.value = '' }}
            disabled={removendoBase !== null}
            title="Remove os insumos avulsos que vieram de uma importação específica — sem afetar avulsos de outras bases nem insumos embutidos em composições"
            className="rounded-md border border-gray-300 px-2.5 py-2 text-xs text-gray-600 outline-none focus:border-blue-500 disabled:opacity-40"
          >
            <option value="">{removendoBase ? `Removendo "${removendoBase}"…` : 'Remover base importada…'}</option>
            {basesPresentesAvulsos.map(([base, count]) => (
              <option key={base} value={base}>{base} ({count})</option>
            ))}
          </select>
        )}
        {selecionadas.size > 0 && (
          <button
            onClick={handleAplicarSugestoes}
            disabled={aplicandoSugestoes}
            className="flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            <Sparkles size={14} />
            {aplicandoSugestoes ? 'Aplicando…' : `Aplicar ${selecionadas.size} sugestão(ões)`}
          </button>
        )}
        <ExportInsumoModeloButton />
        <button onClick={handleExport} disabled={insumos.length === 0}
          className="flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Exportar XLSX
        </button>
        <button
          onClick={handleClearClick}
          disabled={limpandoAvulsos}
          title="Remove só os insumos avulsos (com preço próprio) — insumos embutidos em composições não são afetados"
          className="flex items-center gap-1.5 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          {limpandoAvulsos ? 'Limpando…' : 'Limpar avulsos'}
        </button>
      </div>

      {usoStatus === 'erro' && (
        <p className="text-xs text-amber-600">
          Não foi possível carregar os insumos embutidos em composições e o uso das linhas. Recarregue a página para tentar de novo.
        </p>
      )}

      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-16rem)] rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3 text-right cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('custo')}>
                Custo <SortIcon field="custo" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('fornecedor')}>
                Fornecedor <SortIcon field="fornecedor" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="px-4 py-3 cursor-pointer select-none hover:text-gray-700" onClick={() => toggleSort('data_cotacao')}>
                Data cotação <SortIcon field="data_cotacao" sortField={sortField} sortDir={sortDir} />
              </th>
              <th className="px-4 py-3">
                {sugeridasVisiveis.length > 0 ? (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={todasSugeridasSelecionadas} onChange={alternarSelecaoTodas}
                      className="h-3.5 w-3.5 accent-amber-500 cursor-pointer" />
                    Sugestão
                  </label>
                ) : 'Sugestão'}
              </th>
              <th className="px-4 py-3 text-center" title="Insumo estimado — aparece destacado no Resumo do Orçamento">Estim.</th>
              <th className="px-4 py-3">Grupo</th>
              <th className="px-4 py-3">Base</th>
              <th className="px-4 py-3">Data Ref.</th>
              <th className="px-4 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-gray-400">
                  {q ? 'Nenhum insumo encontrado para essa busca.' : 'Nenhum insumo cadastrado neste orçamento.'}
                </td>
              </tr>
            ) : (
              paged.map((insumo) => {
                const isSaving = savingId === insumo.id
                const isDeleting = deletingId === insumo.id
                return (
                  <tr key={insumo.id} className={`group hover:bg-gray-50 ${isDeleting ? 'opacity-40' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {insumo.codigo}
                      {insumo.codigo_original && insumo.codigo_original !== insumo.codigo && (
                        <span className="block text-[10px] text-gray-400" title="Código original, antes do prefixo do projeto">
                          orig. {insumo.codigo_original}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{insumo.descricao}</td>
                    <td className="px-4 py-3 text-gray-500">{insumo.unidade}</td>

                    {/* Custo — clique abre o modal de cotação (preço + fornecedor + data + observações) */}
                    <td className="px-4 py-3 text-right w-36">
                      <span
                        onClick={() => !savingId && abrirCotacaoModal(insumo)}
                        className={`block text-right tabular-nums ${cellClass()} ${isSaving ? 'text-gray-400' : 'text-gray-900'}`}
                        title="Clique para editar preço e cotação"
                      >
                        {isSaving ? '…' : fmtMoeda(insumo.custo)}
                      </span>
                    </td>

                    {/* Fornecedor — indicador discreto, detalhe completo (+ observação) no hover */}
                    <td className="px-4 py-3 text-gray-500">
                      <span
                        onClick={() => !savingId && abrirCotacaoModal(insumo)}
                        className={`flex items-center gap-1.5 ${cellClass()}`}
                        title={insumo.cotacao_observacoes ? `${insumo.fornecedor ?? 'Sem fornecedor'} — ${insumo.cotacao_observacoes}` : (insumo.fornecedor ?? 'Clique para informar o fornecedor')}
                      >
                        {insumo.fornecedor && <Truck size={12} className="shrink-0 text-gray-400" />}
                        <span className="truncate max-w-[140px]">{insumo.fornecedor || <span className="text-gray-300">—</span>}</span>
                      </span>
                    </td>

                    {/* Data da cotação (informada pelo usuário — distinta de Data Ref., que é automática) */}
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      <span
                        onClick={() => !savingId && abrirCotacaoModal(insumo)}
                        className={`flex items-center gap-1.5 ${cellClass()}`}
                      >
                        {insumo.data_cotacao && <CalendarDays size={12} className="shrink-0 text-gray-400" />}
                        {insumo.data_cotacao ? fmtDataCotacao(insumo.data_cotacao) : <span className="text-gray-300">—</span>}
                      </span>
                    </td>

                    {/* Sugestão — cotação já registrada em outra obra pro mesmo código,
                        só aparece pra avulsos ainda sem preço (ver temSugestao). */}
                    <td className="px-4 py-3 text-gray-500">
                      {temSugestao(insumo) ? (() => {
                        const s = sugestoesState[insumo.codigo]
                        return (
                          <label className="flex items-center gap-2 cursor-pointer"
                            title={`${fmtMoeda(s.valor)} · ${s.fornecedor ?? 'sem fornecedor'} · ${s.orcamentoNome}${s.data_cotacao ? ` · ${fmtDataCotacao(s.data_cotacao)}` : ''}`}>
                            <input type="checkbox" checked={selecionadas.has(insumo.id)}
                              onChange={() => alternarSelecao(insumo.id)}
                              className="h-3.5 w-3.5 accent-amber-500 cursor-pointer shrink-0" />
                            <span className="min-w-0">
                              <span className="block tabular-nums font-medium text-amber-700">{fmtMoeda(s.valor)}</span>
                              <span className="block truncate max-w-[140px] text-[11px] text-gray-400">
                                {s.fornecedor ?? 'sem fornecedor'} · {s.orcamentoNome}
                              </span>
                            </span>
                          </label>
                        )
                      })() : <span className="text-gray-300">—</span>}
                    </td>

                    {/* Estimado — reflete a cotação ativa deste insumo; marcar/
                        desmarcar acontece no modal de cotação (clique aqui
                        abre o mesmo modal que Custo/Fornecedor/Data). */}
                    <td className="px-2 py-3 text-center">
                      <span onClick={() => !savingId && abrirCotacaoModal(insumo)} className={cellClass()}>
                        <EstimadoBadge estimado={insumo.estimado ?? false} estimadoMotivo={insumo.estimado_motivo} />
                      </span>
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
                        <button onClick={e => openHistoricoModal(insumo, e)}
                          title="Ver histórico de preço"
                          className="opacity-0 group-hover:opacity-100 rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-all">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                        <button onClick={() => setConfirmarExcluir({ id: insumo.id, codigo: insumo.codigo })}
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
      <ComposicoesModal
        modal={composicoesModal}
        orcamentoId={orcamentoId}
        onClose={() => setComposicoesModal(null)}
      />
    )}

    {/* Modal: Cotação — preço + fornecedor + data + observações, 1 painel só,
        salva tudo de uma vez (Funcionalidade "Interface" do épico de cotações).
        Componente compartilhado com composicao-detail.tsx — ver
        cotacao-insumo-modal.tsx. */}
    {cotacaoModal && (
      <CotacaoInsumoModal
        alvo={cotacaoModal}
        onClose={() => setCotacaoModal(null)}
        onSave={handleSalvarCotacao}
      />
    )}

    {historicoModal && (
      <HistoricoPrecoModal
        modal={historicoModal}
        onClose={() => setHistoricoModal(null)}
        onExcluirRegistro={item => setConfirmarExcluirHistorico(item)}
      />
    )}

    <ConfirmDialog
      open={!!confirmarExcluir}
      onClose={() => setConfirmarExcluir(null)}
      onConfirm={handleDelete}
      title="Excluir insumo"
      description={confirmarExcluir ? <>Excluir o insumo <strong>{confirmarExcluir.codigo}</strong>?</> : null}
      confirmLabel="Excluir"
      danger
    />

    <ConfirmDialog
      open={!!confirmarExcluirHistorico}
      onClose={() => setConfirmarExcluirHistorico(null)}
      onConfirm={excluirHistoricoPreco}
      title="Remover registro do histórico"
      description="Remover este registro do histórico de preço? Ele some do gráfico e da lista, mas a remoção fica auditada."
      confirmLabel="Remover"
      danger
    />

    <ConfirmDialog
      open={!!confirmarLimparAvulsos}
      onClose={() => setConfirmarLimparAvulsos(null)}
      onConfirm={handleClear}
      title="Limpar insumos avulsos"
      description={confirmarLimparAvulsos ? `Excluir todos os ${confirmarLimparAvulsos.total} insumos avulsos deste orçamento? Esta ação não pode ser desfeita.` : null}
      confirmLabel="Excluir todos"
      danger
    />

    <ConfirmDialog
      open={!!baseParaConfirmar}
      onClose={() => setBaseParaConfirmar(null)}
      onConfirm={handleRemoverBase}
      title="Remover base importada"
      description={baseParaConfirmar ? <>Excluir os {insumos.filter(ins => ins.composicao_id === null && ins.base === baseParaConfirmar).length} insumo(s) avulso(s) importado(s) da base <strong>{baseParaConfirmar}</strong> deste orçamento? Esta ação não pode ser desfeita.</> : null}
      confirmLabel="Excluir"
      danger
    />
    </>
  )
}
