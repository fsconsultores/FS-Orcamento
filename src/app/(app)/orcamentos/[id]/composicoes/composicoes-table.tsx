'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { OrcamentoComposicao } from '@/lib/orcamento'
import { ClientPagination } from '@/components/client-pagination'
import { formatCurrency } from '@/lib/costs'
import { getComposicoesDetalhadoAction, exportComposicoesAction } from './actions'
import { previewLimparNaoUtilizadosAction, executarLimparNaoUtilizadosAction, type PreviaLimpezaNaoUtilizados } from '../insumos/actions'
import { ExportComposicoesButton } from '@/components/export-composicoes-button'
import { ExportComposicaoModeloButton } from '@/components/export-composicao-modelo-button'
import { ConfirmDialog } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { HighlightMatch } from '@/components/ui/highlight-match'

const PAGE_SIZE = 100

export function ComposicoesTable({
  composicoes: initialComposicoes,
  orcamentoId,
}: {
  /** Sem custo_unitario — carregado à parte, em background (ver useEffect abaixo). */
  composicoes: Omit<OrcamentoComposicao, 'custo_unitario'>[]
  orcamentoId: string
}) {
  const toast = useToast()
  const [composicoes, setComposicoes] = useState<OrcamentoComposicao[]>(
    () => initialComposicoes.map((c) => ({ ...c, custo_unitario: 0 }))
  )
  const [query, setQuery] = useState('')
  const [filtroUso, setFiltroUso] = useState<'todos' | 'usados' | 'nao_usados'>('todos')
  const [filtroOrigem, setFiltroOrigem] = useState<'todas' | 'proprias' | 'importadas'>('todas')
  const [codigosUtilizados, setCodigosUtilizados] = useState<string[]>([])
  const usadosSet = useMemo(() => new Set(codigosUtilizados), [codigosUtilizados])
  const [currentPage, setCurrentPage] = useState(1)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [clearing, setClearing] = useState(false)
  const [removendoBase, setRemovendoBase] = useState<string | null>(null)
  const [confirmarExcluir, setConfirmarExcluir] = useState<OrcamentoComposicao | null>(null)
  const [confirmarLimpar, setConfirmarLimpar] = useState(false)
  const [confirmarExcluirNaoUtilizadas, setConfirmarExcluirNaoUtilizadas] = useState<PreviaLimpezaNaoUtilizados | null>(null)
  const [excluindoNaoUtilizadas, setExcluindoNaoUtilizadas] = useState(false)
  const [carregandoPreviaLimpeza, setCarregandoPreviaLimpeza] = useState(false)
  const [baseParaConfirmar, setBaseParaConfirmar] = useState<string | null>(null)

  // Custo unitário (cálculo em cadeia) e "usados/não usados" dependem do
  // grafo completo de composições+insumos do orçamento — caro demais pra
  // calcular antes da primeira renderização (ver actions.ts). Busca em
  // background assim que a tabela monta; enquanto isso a coluna Custo
  // mostra um skeleton e os filtros de uso ficam desabilitados.
  const [custosStatus, setCustosStatus] = useState<'carregando' | 'pronto' | 'erro'>('carregando')

  useEffect(() => {
    let cancelado = false
    getComposicoesDetalhadoAction(orcamentoId)
      .then(({ custosPorId, codigosUtilizados }) => {
        if (cancelado) return
        setComposicoes((prev) => prev.map((c) => ({ ...c, custo_unitario: custosPorId[c.id] ?? c.custo_unitario })))
        setCodigosUtilizados(codigosUtilizados)
        setCustosStatus('pronto')
      })
      .catch((err) => {
        if (cancelado) return
        console.error('[ComposicoesTable] erro ao carregar custos', err)
        setCustosStatus('erro')
      })
    return () => { cancelado = true }
  }, [orcamentoId])

  // Bases presentes entre as composições importadas (base === null = criada
  // no projeto, já coberta pelo filtro de origem — não entra aqui).
  const basesPresentes = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const c of composicoes) {
      if (c.base) contagem.set(c.base, (contagem.get(c.base) ?? 0) + 1)
    }
    return [...contagem.entries()].sort((a, b) => b[1] - a[1])
  }, [composicoes])

  const q = query.trim().toLowerCase()
  // Memoizado pelo mesmo motivo de insumos-table.tsx: evita refiltrar a
  // lista inteira em renders disparados por estado que não afeta a busca
  // (deletingId, clearing, etc.).
  const visible = useMemo(() => {
    const porTexto = q
      ? composicoes.filter(
          (c) =>
            c.codigo.toLowerCase().includes(q) ||
            c.descricao.toLowerCase().includes(q)
        )
      : composicoes
    const porUso = filtroUso === 'todos'
      ? porTexto
      : porTexto.filter((c) => usadosSet.has(c.codigo) === (filtroUso === 'usados'))
    // base === null: criada direto neste orçamento (formulário "Nova composição").
    // base !== null: veio de uma importação (guarda o nome da base de origem).
    return filtroOrigem === 'todas'
      ? porUso
      : porUso.filter((c) => (c.base === null) === (filtroOrigem === 'proprias'))
  }, [composicoes, q, filtroUso, filtroOrigem, usadosSet])

  useEffect(() => { setCurrentPage(1) }, [q, filtroUso, filtroOrigem])

  const paged = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  async function handleDelete() {
    if (!confirmarExcluir) return
    const id = confirmarExcluir.id
    setConfirmarExcluir(null)
    const anterior = composicoes
    setDeletingId(id)
    setComposicoes(prev => prev.filter(c => c.id !== id))
    const sb = createClient() as any
    const { error } = await sb.from('orcamento_composicoes').delete().eq('id', id)
    if (error) {
      setComposicoes(anterior)
      toast.show(`Erro ao excluir: ${error.message}`, 'error')
    }
    setDeletingId(null)
  }

  async function handleClear() {
    if (composicoes.length === 0) return
    setConfirmarLimpar(false)
    setClearing(true)
    const sb = createClient() as any
    const ids = composicoes.map(c => c.id)
    try {
      // Exclui primeiro os insumos vinculados: a FK orcamento_insumos.composicao_id é
      // ON DELETE SET NULL, então excluir a composição direto os transformaria em avulsos.
      for (let i = 0; i < ids.length; i += 100) {
        const { error: errIns } = await sb
          .from('orcamento_insumos')
          .delete()
          .in('composicao_id', ids.slice(i, i + 100))
        if (errIns) throw new Error(errIns.message)
      }
      const { error } = await sb
        .from('orcamento_composicoes')
        .delete()
        .eq('orcamento_id', orcamentoId)
      if (error) throw new Error(error.message)
      setComposicoes([])
    } catch (err) {
      toast.show(`Erro ao limpar composições: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
    setClearing(false)
  }

  /**
   * Limpeza combinada: remove insumos avulsos E composições não utilizadas
   * (com os insumos embutidos nelas) — a mesma ação usada pelo botão
   * equivalente na aba Insumos (previewLimparNaoUtilizadosAction/
   * executarLimparNaoUtilizadosAction), pra dar o resultado idêntico não
   * importa qual das duas abas o usuário usa pra limpar.
   */
  async function handleExcluirNaoUtilizadasClick() {
    if (custosStatus !== 'pronto') {
      toast.show('Aguarde o carregamento dos dados de uso antes de excluir as não utilizadas.', 'info')
      return
    }
    setCarregandoPreviaLimpeza(true)
    try {
      const previa = await previewLimparNaoUtilizadosAction(orcamentoId)
      if (previa.avulsos.length === 0 && previa.composicoes.length === 0) {
        toast.show('Nada para limpar — todos os insumos e composições aparecem em algum item da planilha.', 'info')
        return
      }
      setConfirmarExcluirNaoUtilizadas(previa)
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Erro ao verificar o que está não utilizado.', 'error')
    } finally {
      setCarregandoPreviaLimpeza(false)
    }
  }

  async function handleExcluirNaoUtilizadas() {
    if (!confirmarExcluirNaoUtilizadas) return
    const { avulsos, composicoes: composicoesAlvo } = confirmarExcluirNaoUtilizadas
    setConfirmarExcluirNaoUtilizadas(null)
    setExcluindoNaoUtilizadas(true)
    const avulsoIds = avulsos.map((a) => a.id)
    const composicaoIds = composicoesAlvo.map((c) => c.id)
    try {
      const { avulsosRemovidos, composicoesRemovidas } = await executarLimparNaoUtilizadosAction(orcamentoId, avulsoIds, composicaoIds)
      setComposicoes((prev) => prev.filter((c) => !composicaoIds.includes(c.id)))
      const partes = []
      if (avulsosRemovidos > 0) partes.push(`${avulsosRemovidos} insumo(s) avulso(s)`)
      if (composicoesRemovidas > 0) partes.push(`${composicoesRemovidas} composição(ões) (com os insumos embutidos)`)
      toast.show(`${partes.join(' e ')} não utilizado(s) removido(s) com sucesso.`)
    } catch (err) {
      toast.show(`Erro ao excluir os não utilizados: ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
    setExcluindoNaoUtilizadas(false)
  }

  /**
   * Desfaz uma importação específica: remove só as composições (+ insumos
   * vinculados a elas) e os insumos avulsos que vieram daquela base — sem
   * mexer em nada criado direto no projeto ou importado de outra base.
   * Existe porque um código reaproveitado entre bases diferentes (ex.:
   * mesmo "CZ7044" usado em dois projetos com significados diferentes) pode
   * fazer a sincronização de custos pisar num item que já existia no
   * orçamento com o mesmo código — a única forma segura de reverter isso é
   * apagando de volta tudo que entrou naquela importação.
   */
  async function handleRemoverBase() {
    const base = baseParaConfirmar
    if (!base) return
    const compsDaBase = composicoes.filter(c => c.base === base)
    setBaseParaConfirmar(null)
    if (compsDaBase.length === 0) return

    setRemovendoBase(base)
    const sb = createClient() as any
    const ids = compsDaBase.map(c => c.id)
    try {
      // Insumos embutidos nessas composições primeiro (mesma ordem de handleClear,
      // mesmo motivo: composicao_id é ON DELETE SET NULL).
      for (let i = 0; i < ids.length; i += 100) {
        const { error: errIns } = await sb
          .from('orcamento_insumos')
          .delete()
          .in('composicao_id', ids.slice(i, i + 100))
        if (errIns) throw new Error(errIns.message)
      }
      // Insumos avulsos da mesma base (não vinculados a nenhuma composição,
      // mas que vieram do mesmo lote de importação).
      const { error: errAvulsos } = await sb
        .from('orcamento_insumos')
        .delete()
        .eq('orcamento_id', orcamentoId)
        .eq('base', base)
        .is('composicao_id', null)
      if (errAvulsos) throw new Error(errAvulsos.message)

      const { error } = await sb
        .from('orcamento_composicoes')
        .delete()
        .eq('orcamento_id', orcamentoId)
        .eq('base', base)
      if (error) throw new Error(error.message)

      setComposicoes(prev => prev.filter(c => c.base !== base))
    } catch (err) {
      toast.show(`Erro ao remover a base "${base}": ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
    setRemovendoBase(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[280px] max-w-xs">
          <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            type="search"
            placeholder="Buscar por código ou descrição..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <div className="flex gap-1">
          {([
            { v: 'todos', label: 'Todos' },
            { v: 'usados', label: 'Utilizados no projeto' },
            { v: 'nao_usados', label: 'Não utilizados' },
          ] as const).map(({ v, label }) => {
            const disabled = v !== 'todos' && custosStatus !== 'pronto'
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
            { v: 'todas', label: 'Todas' },
            { v: 'proprias', label: 'Criadas no projeto' },
            { v: 'importadas', label: 'Importadas de base' },
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
        {basesPresentes.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap" title="Remove as composições (e insumos vinculados/avulsos) que vieram de uma importação específica — sem afetar o resto do orçamento">
            <span className="text-xs text-gray-400">Remover base importada:</span>
            {basesPresentes.map(([base, count]) => (
              <button
                key={base}
                onClick={() => setBaseParaConfirmar(base)}
                disabled={removendoBase !== null}
                className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {removendoBase === base ? `Removendo…` : `${base} (${count})`}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Ações em linha própria — separada dos filtros acima de propósito: com
          tudo numa linha só, o número de filtros (que difere de Insumos, ver
          aba equivalente) empurra o wrap do flex-wrap pra um ponto diferente
          em cada aba, fazendo os botões de ação começarem em posições
          diferentes entre as duas telas irmãs. */}
      <div className="flex items-center gap-3 flex-wrap">
        <ExportComposicaoModeloButton />
        <ExportComposicoesButton fetchComposicoes={() => exportComposicoesAction(orcamentoId)} />
        <button
          onClick={() => setConfirmarLimpar(true)}
          disabled={composicoes.length === 0 || clearing}
          className="flex items-center gap-1.5 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          {clearing ? 'Limpando…' : 'Limpar composições'}
        </button>
        <button
          onClick={handleExcluirNaoUtilizadasClick}
          disabled={excluindoNaoUtilizadas || carregandoPreviaLimpeza || custosStatus !== 'pronto'}
          title="Remove os insumos avulsos e as composições que não aparecem em nenhum item da planilha (composições não utilizadas saem junto com os insumos embutidos nelas) — mesma limpeza do botão equivalente na aba Insumos"
          className="flex items-center gap-1.5 rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          {excluindoNaoUtilizadas ? 'Excluindo…' : carregandoPreviaLimpeza ? 'Verificando…' : 'Excluir não utilizados'}
        </button>
      </div>

      {custosStatus === 'erro' && (
        <p className="text-xs text-amber-600">
          Não foi possível calcular os custos e o uso das composições. Recarregue a página para tentar de novo.
        </p>
      )}

      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-16rem)] rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3">Unidade</th>
              <th className="px-4 py-3 text-right">
                Custo Unitário
                <span className="ml-1 font-normal normal-case text-gray-400">(calculado)</span>
              </th>
              <th className="px-4 py-3">Base</th>
              <th className="px-4 py-3 w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  {q ? 'Nenhuma composição encontrada.' : 'Nenhuma composição cadastrada neste orçamento.'}
                </td>
              </tr>
            ) : (
              paged.map((c) => (
                <tr key={c.id}
                  className={`group cursor-pointer hover:bg-blue-50 hover:shadow-[inset_3px_0_0_0_#3b82f6] transition-all ${deletingId === c.id ? 'opacity-40' : ''}`}
                >
                  <td className="p-0 font-mono text-xs text-gray-600">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full px-4 py-3">
                      <HighlightMatch text={c.codigo} query={query} />
                      {c.codigo_original && c.codigo_original !== c.codigo && (
                        <span className="block text-[10px] text-gray-400" title="Código original, antes do prefixo do projeto">
                          orig. {c.codigo_original}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full px-4 py-3"><HighlightMatch text={c.descricao} query={query} /></Link>
                  </td>
                  <td className="p-0 text-gray-500">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full px-4 py-3">{c.unidade}</Link>
                  </td>
                  <td className="p-0 text-right tabular-nums text-gray-700">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full px-4 py-3">
                      {custosStatus === 'carregando'
                        ? <span className="ml-auto block h-3.5 w-16 animate-pulse rounded bg-gray-200" />
                        : c.custo_unitario > 0
                          ? formatCurrency(c.custo_unitario)
                          : <span className="text-gray-300">—</span>}
                    </Link>
                  </td>
                  <td className="p-0 text-gray-500">
                    <Link href={`/orcamentos/${orcamentoId}/composicoes/${c.id}`} className="block w-full px-4 py-3">{c.base ?? '—'}</Link>
                  </td>
                  <td className="px-2 py-3">
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmarExcluir(c) }}
                      title="Excluir composição"
                      className="opacity-0 group-hover:opacity-100 rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ClientPagination
        total={visible.length}
        page={currentPage}
        pageSize={PAGE_SIZE}
        onPageChange={setCurrentPage}
      />

      <ConfirmDialog
        open={!!confirmarExcluir}
        onClose={() => setConfirmarExcluir(null)}
        onConfirm={handleDelete}
        title="Excluir composição"
        description={confirmarExcluir ? <>Excluir a composição <strong>{confirmarExcluir.codigo}</strong> — {confirmarExcluir.descricao}? Os insumos vinculados não serão excluídos.</> : null}
        confirmLabel="Excluir"
        danger
      />

      <ConfirmDialog
        open={confirmarLimpar}
        onClose={() => setConfirmarLimpar(false)}
        onConfirm={handleClear}
        title="Limpar composições"
        description={`Excluir todas as ${composicoes.length} composições deste orçamento e os insumos vinculados a elas? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir todas"
        danger
      />

      <ConfirmDialog
        open={!!confirmarExcluirNaoUtilizadas}
        onClose={() => setConfirmarExcluirNaoUtilizadas(null)}
        onConfirm={handleExcluirNaoUtilizadas}
        title="Excluir não utilizados"
        description={confirmarExcluirNaoUtilizadas ? (
          <>
            Nada disso aparece em nenhum item da planilha deste orçamento:
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              {confirmarExcluirNaoUtilizadas.avulsos.length > 0 && (
                <li>{confirmarExcluirNaoUtilizadas.avulsos.length} insumo(s) avulso(s)</li>
              )}
              {confirmarExcluirNaoUtilizadas.composicoes.length > 0 && (
                <li>{confirmarExcluirNaoUtilizadas.composicoes.length} composição(ões) — junto com os insumos embutidos nelas</li>
              )}
            </ul>
            <p className="mt-2">Os utilizados não são afetados. Esta ação não pode ser desfeita.</p>
          </>
        ) : null}
        confirmLabel="Excluir"
        danger
      />

      <ConfirmDialog
        open={!!baseParaConfirmar}
        onClose={() => setBaseParaConfirmar(null)}
        onConfirm={handleRemoverBase}
        title="Remover base importada"
        description={baseParaConfirmar ? <>Excluir as {composicoes.filter(c => c.base === baseParaConfirmar).length} composição(ões) importada(s) da base <strong>{baseParaConfirmar}</strong> deste orçamento, os insumos vinculados a elas e os insumos avulsos vindos da mesma base? Esta ação não pode ser desfeita.</> : null}
        confirmLabel="Excluir"
        danger
      />
    </div>
  )
}
