'use client'

import { useMemo, useState, useRef } from 'react'
import { ClipboardCheck, X, ExternalLink, AlertTriangle } from 'lucide-react'
import { buscarEstruturaParaConferencia } from './planilha-import-action'
import {
  CAMPOS, sugerirMapeamento, parseMatrix, lerArquivoPlanilha, motivoLabel,
  type AbaBruta, type CampoAlvo, type Mapeamento, type LinhaIgnorada,
} from '@/lib/orcamento/planilha-excel-parser'
import { compararComExcel, type ItemConferencia, type ResumoConferencia, type StatusItemConferencia } from '@/lib/orcamento/conferencia-importacao'
import { WizardSteps } from '@/components/ui/import-wizard'

/**
 * Conferência de Importação — compara um Excel (reenviado a qualquer
 * momento, não só logo após importar) contra o estado ATUAL da planilha,
 * usando o MESMO parser/mapeamento de colunas da Importação (ver
 * planilha-excel-parser.ts). Não escreve nada no banco — é só diagnóstico:
 * o Excel é lido, comparado, e descartado depois. Ver proposta "Conferência
 * de Importação" (28/08/2026) para o raciocínio completo.
 */

const STATUS_META: Record<StatusItemConferencia, { label: string; cls: string; badge: string }> = {
  confere: { label: 'Confere', cls: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
  diferenca: { label: 'Diferença', cls: 'text-amber-700', badge: 'bg-amber-100 text-amber-700' },
  ausente: { label: 'Ausente no orçamento', cls: 'text-red-700', badge: 'bg-red-100 text-red-700' },
  sobrando: { label: 'Sobrando no orçamento', cls: 'text-red-700', badge: 'bg-red-100 text-red-700' },
  duplicado_excel: { label: 'Duplicado no Excel', cls: 'text-red-700', badge: 'bg-red-100 text-red-700' },
  duplicado_orcamento: { label: 'Duplicado no orçamento', cls: 'text-red-700', badge: 'bg-red-100 text-red-700' },
}

const CAMPO_LABEL: Record<string, string> = { descricao: 'Descrição', unidade: 'Unidade', quantidade: 'Quantidade', estrutura: 'Nível na hierarquia' }

function fmtValor(v: string | number | null): string {
  if (v == null) return '—'
  return String(v)
}

const STEPS = [
  { key: 'arquivo', label: 'Arquivo' },
  { key: 'mapeamento', label: 'Colunas' },
  { key: 'resultado', label: 'Resultado' },
]

export function ConferenciaImportacaoForm({ orcamentoId, planilhaId }: { orcamentoId: string; planilhaId?: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  const [abas, setAbas] = useState<AbaBruta[] | null>(null)
  const [abaSelecionada, setAbaSelecionada] = useState<string>('')
  const [abaAutoDetectada, setAbaAutoDetectada] = useState<string>('')
  const [mapeamento, setMapeamento] = useState<Mapeamento | null>(null)
  const [mapeamentoConfirmado, setMapeamentoConfirmado] = useState(false)

  const [itens, setItens] = useState<ItemConferencia[] | null>(null)
  const [resumo, setResumo] = useState<ResumoConferencia | null>(null)
  const [linhasIgnoradas, setLinhasIgnoradas] = useState<LinhaIgnorada[]>([])
  const [mostrarTudo, setMostrarTudo] = useState(false)

  const abaAtual = abas?.find(a => a.nome === abaSelecionada) ?? null

  const preview = useMemo(() => {
    if (!abaAtual || !mapeamento) return null
    return parseMatrix(abaAtual.matrix, mapeamento, abaAtual.linhaCabecalho + 1)
  }, [abaAtual, mapeamento])

  function carregarAba(aba: AbaBruta) {
    setAbaSelecionada(aba.nome)
    setMapeamento(sugerirMapeamento(aba.header))
    setMapeamentoConfirmado(false)
    setErro(aba.header.length === 0 ? 'Não foi possível identificar uma linha de cabeçalho nesta aba.' : null)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErro(null); setAbas(null); setAbaSelecionada(''); setAbaAutoDetectada('')
    setMapeamento(null); setMapeamentoConfirmado(false); setItens(null); setResumo(null)

    try {
      const { abas: todasAbas, melhorIndice } = await lerArquivoPlanilha(file)
      if (todasAbas.length > 1) { setAbas(todasAbas); setAbaAutoDetectada(todasAbas[melhorIndice].nome) }
      carregarAba(todasAbas[melhorIndice])
      if (todasAbas.length === 1) setAbas(todasAbas)
    } catch {
      setErro('Não foi possível ler este arquivo. Confirme o formato (.xlsx, .xls, .ods ou .csv).')
    }
  }

  function trocarAba(nome: string) {
    const aba = abas?.find(a => a.nome === nome)
    if (aba) carregarAba(aba)
  }

  function alterarColunaDoIndice(idx: number, novoCampo: CampoAlvo | 'ignorar') {
    setMapeamento(prev => {
      if (!prev) return prev
      const next = { ...prev }
      for (const campo of Object.keys(next) as CampoAlvo[]) {
        if (next[campo] === idx) next[campo] = null
      }
      if (novoCampo !== 'ignorar') next[novoCampo] = idx
      return next
    })
  }

  function campoDoIndice(idx: number): CampoAlvo | 'ignorar' {
    if (!mapeamento) return 'ignorar'
    for (const campo of Object.keys(mapeamento) as CampoAlvo[]) {
      if (mapeamento[campo] === idx) return campo
    }
    return 'ignorar'
  }

  const camposFaltando = CAMPOS.filter(c => c.obrigatorio && mapeamento?.[c.key] == null)

  async function handleConferir() {
    if (!preview?.rows.length) return
    setCarregando(true)
    setErro(null)
    try {
      const estruturaAtual = await buscarEstruturaParaConferencia(orcamentoId, planilhaId)
      const resultado = compararComExcel(preview.rows, estruturaAtual)
      setItens(resultado.itens)
      setResumo({ ...resultado.resumo, naoReconhecidas: preview.ignoradas.length })
      setLinhasIgnoradas(preview.ignoradas)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível comparar. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  function limpar() {
    setAbas(null); setAbaSelecionada(''); setAbaAutoDetectada(''); setMapeamento(null); setMapeamentoConfirmado(false)
    setItens(null); setResumo(null); setLinhasIgnoradas([]); setErro(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <ClipboardCheck size={16} />
        Conferir com Excel
      </button>
    )
  }

  const step = itens ? 'resultado' : mapeamentoConfirmado ? 'resultado' : abaAtual ? 'mapeamento' : 'arquivo'
  const itensParaMostrar = itens ? (mostrarTudo ? itens : itens.filter(i => i.status !== 'confere' || i.foraDeOrdem)) : []

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Conferência de Importação</h3>
        <button onClick={() => { setOpen(false); limpar() }} className="text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>

      <WizardSteps steps={STEPS} currentKey={step} />

      {!abaAtual && !itens && (
        <>
          <p className="rounded-md bg-white border border-gray-200 p-3 text-xs text-gray-600">
            Envie o Excel original (o mesmo usado na importação, ou uma versão mais nova) para comparar contra o
            que está na planilha agora. Nada é alterado — é só um relatório de diferenças. Reaproveita o mesmo
            mapeamento de colunas da importação.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.ods,.csv,.txt"
            onChange={handleFile}
            className="block text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-amber-600 file:text-white file:font-medium hover:file:bg-amber-700 cursor-pointer"
          />
        </>
      )}

      {abas && abas.length > 1 && !itens && (
        <div className="rounded-md border border-amber-200 bg-white px-3 py-2 space-y-1">
          <div className="flex items-center gap-3">
            <label htmlFor="aba-conferencia" className="text-sm font-medium text-gray-700 whitespace-nowrap">Aba do arquivo:</label>
            <select
              id="aba-conferencia"
              value={abaSelecionada}
              onChange={e => trocarAba(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            >
              {abas.map(a => (
                <option key={a.nome} value={a.nome}>{a.nome}{a.nome === abaAutoDetectada ? ' — detectada automaticamente' : ''}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {erro && <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">{erro}</div>}

      {/* ── Mapeamento de colunas ─────────────────────────────────────────── */}
      {abaAtual && abaAtual.header.length > 0 && !mapeamentoConfirmado && !itens && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">Confirme o que cada coluna do arquivo representa (mesmo mapeamento da importação).</p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-500 uppercase">
                <tr><th className="px-3 py-2">Coluna no arquivo</th><th className="px-3 py-2">Exemplo</th><th className="px-3 py-2">Usar como</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {abaAtual.header.map((h, i) => {
                  const exemplo = String(abaAtual.matrix[abaAtual.linhaCabecalho + 1]?.[i] ?? '').trim()
                  const atual = campoDoIndice(i)
                  return (
                    <tr key={i} className={atual === 'ignorar' ? 'text-gray-400' : ''}>
                      <td className="px-3 py-2 font-medium text-gray-800">{h || `Coluna ${i + 1}`}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate">{exemplo || '—'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={atual}
                          onChange={e => alterarColunaDoIndice(i, e.target.value as CampoAlvo | 'ignorar')}
                          className="rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                        >
                          <option value="ignorar">Não usar</option>
                          {CAMPOS.map(c => (
                            <option key={c.key} value={c.key} disabled={mapeamento?.[c.key] != null && mapeamento[c.key] !== i}>{c.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {camposFaltando.length > 0 && (
            <p className="text-xs text-amber-700">Falta mapear: {camposFaltando.map(c => c.label).join(', ')} (obrigatório).</p>
          )}
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{preview?.rows.length ?? 0} linha(s) reconhecida(s) no arquivo.</p>
            <button
              onClick={() => setMapeamentoConfirmado(true)}
              disabled={camposFaltando.length > 0 || !preview?.rows.length}
              className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40"
            >
              Comparar com a planilha →
            </button>
          </div>
        </div>
      )}

      {mapeamentoConfirmado && !itens && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">{preview?.rows.length ?? 0} linha(s) do arquivo prontas para comparar.</p>
          <div className="flex gap-2">
            <button onClick={() => setMapeamentoConfirmado(false)} className="rounded border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">← Ajustar colunas</button>
            <button
              onClick={handleConferir}
              disabled={carregando}
              className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {carregando ? 'Comparando…' : 'Comparar agora'}
            </button>
          </div>
        </div>
      )}

      {/* ── Resultado ─────────────────────────────────────────────────────── */}
      {itens && resumo && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <ResumoCard label="Conferem" valor={resumo.confere} tom="ok" />
            <ResumoCard label="Diferença" valor={resumo.diferenca} tom="warn" />
            <ResumoCard label="Ausentes" valor={resumo.ausente} tom="bad" />
            <ResumoCard label="Sobrando" valor={resumo.sobrando + resumo.duplicado} tom="bad" />
            <ResumoCard label="Não reconhecidas" valor={resumo.naoReconhecidas} tom="info" />
          </div>

          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <input type="checkbox" checked={mostrarTudo} onChange={e => setMostrarTudo(e.target.checked)} className="accent-amber-600" />
            Mostrar itens que conferem também
          </label>

          <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
            {itensParaMostrar.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-gray-400">
                {resumo.confere > 0 ? 'Nenhuma divergência encontrada — tudo confere.' : 'Nenhum item para mostrar.'}
              </p>
            ) : itensParaMostrar.slice(0, 300).map((it, i) => {
              const meta = STATUS_META[it.status]
              return (
                <div key={`${it.numero}-${i}`} className="px-3 py-2.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full px-2 py-0.5 font-medium ${meta.badge}`}>{meta.label}</span>
                    {it.foraDeOrdem && <span className="rounded-full px-2 py-0.5 font-medium bg-purple-100 text-purple-700">Fora de ordem</span>}
                    <span className="font-mono text-gray-500">{it.numero}</span>
                    <span className="text-gray-800 truncate">{it.descricaoOrcamento ?? it.descricaoExcel}</span>
                    {it.itemId && (
                      <span className="ml-auto flex items-center gap-1 text-gray-400" title="Localize este item pelo número na Planilha">
                        <ExternalLink size={11} /> item {it.numero} na Planilha
                      </span>
                    )}
                  </div>
                  {it.divergencias.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 pl-1">
                      {it.divergencias.map((d, j) => (
                        <li key={j} className="text-gray-500">
                          <span className="font-medium text-gray-600">{CAMPO_LABEL[d.campo] ?? d.campo}:</span>{' '}
                          Excel <span className="text-gray-700">"{fmtValor(d.valorExcel)}"</span> · Orçamento <span className="text-gray-700">"{fmtValor(d.valorOrcamento)}"</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
            {itensParaMostrar.length > 300 && (
              <p className="px-3 py-2 text-xs text-gray-400 text-center">Mostrando 300 de {itensParaMostrar.length} itens.</p>
            )}
          </div>

          {linhasIgnoradas.length > 0 && (
            <details className="rounded-lg border border-gray-200 bg-white">
              <summary className="cursor-pointer px-3 py-2.5 text-xs font-medium text-gray-600 flex items-center gap-1.5">
                <AlertTriangle size={13} className="text-gray-400" />
                {linhasIgnoradas.length} linha(s) do arquivo não reconhecidas como item
              </summary>
              <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 border-t border-gray-100">
                {linhasIgnoradas.slice(0, 200).map((l, i) => (
                  <div key={i} className="px-3 py-2 text-xs flex items-center gap-3">
                    <span className="w-40 shrink-0 text-gray-500">{motivoLabel(l.motivo)}</span>
                    <span className="text-gray-400 truncate">{l.amostra}</span>
                  </div>
                ))}
                {linhasIgnoradas.length > 200 && (
                  <p className="px-3 py-2 text-xs text-gray-400 text-center">Mostrando 200 de {linhasIgnoradas.length} linhas.</p>
                )}
              </div>
            </details>
          )}

          <div className="flex justify-end">
            <button onClick={() => { limpar(); }} className="rounded border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Conferir outro arquivo</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ResumoCard({ label, valor, tom }: { label: string; valor: number; tom: 'ok' | 'warn' | 'bad' | 'info' }) {
  const cls = {
    ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
    bad: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-gray-50 text-gray-500 border-gray-200',
  }[tom]
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${cls}`}>
      <div className="text-xl font-bold tabular-nums">{valor}</div>
      <div className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</div>
    </div>
  )
}
