'use client'

import { useMemo, useRef } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { OrcamentoInsumo, OrcamentoInsumoCotacao } from '@/lib/orcamento'
import { EstimadoBadge } from '@/components/estimado-badge'
import { formatCurrency } from '@/lib/costs'
import { formatDateOnly, formatDateShort } from '@/lib/format-date'

// Mesmo hue único já usado em ChartDistribuicao (dashboard) pra magnitude/série
// única — reaproveitado aqui pelo mesmo motivo (ver skill dataviz).
const COR_LINHA = '#51286E'

export interface HistoricoPreco {
  id: string
  preco_anterior: number | null
  preco_novo: number
  usuario: string | null
  created_at: string
  fornecedor: string | null
  data_cotacao: string | null
  observacoes: string | null
}

export interface HistoricoModal {
  insumo: OrcamentoInsumo
  loading: boolean
  historico: HistoricoPreco[]
  cotacoes: OrcamentoInsumoCotacao[]
}

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

// Formatação compacta pro eixo do gráfico — sem isso, um valor digitado errado
// (ex.: dígitos a mais sem querer) vira uma string longa demais e quebra a
// largura do eixo. A tabela abaixo continua mostrando o valor completo.
function fmtMoedaCompacta(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1e15) return `R$ ${v.toExponential(1)}`
  if (abs >= 1e12) return `R$ ${(v / 1e12).toFixed(1)}tri`
  if (abs >= 1e9) return `R$ ${(v / 1e9).toFixed(1)}bi`
  if (abs >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}mi`
  if (abs >= 1e3) return `R$ ${(v / 1e3).toFixed(1)}mil`
  return fmtMoeda(v)
}

/**
 * Monta os pontos do gráfico em ordem cronológica. `historico` só guarda
 * pares (preco_anterior, preco_novo) por edição — sem isso, o gráfico começa
 * no preço já alterado da primeira edição registrada, sem mostrar qual era o
 * preço original antes dela. Se o primeiro registro tem preco_anterior, ele
 * vira um ponto extra no início (mesma data, valor anterior).
 */
function construirDadosGrafico(historico: HistoricoPreco[]): { created_at: string; preco_novo: number; fornecedor: string | null }[] {
  const asc = [...historico].reverse()
  const primeiro = asc[0]
  if (primeiro && primeiro.preco_anterior != null) {
    return [{ created_at: primeiro.created_at, preco_novo: primeiro.preco_anterior, fornecedor: null }, ...asc]
  }
  return asc
}

function HistoricoChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload as { created_at: string; preco_novo: number; fornecedor: string | null }
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-gray-800">{fmtDataHora(p.created_at)}</p>
      <p className="mt-0.5 tabular-nums text-gray-500">{fmtMoeda(p.preco_novo)}</p>
      {p.fornecedor && <p className="mt-0.5 text-gray-400">{p.fornecedor}</p>}
    </div>
  )
}

export function HistoricoPrecoModal({
  modal,
  onClose,
  onExcluirRegistro,
}: {
  modal: HistoricoModal
  onClose: () => void
  onExcluirRegistro: (item: HistoricoPreco) => void
}) {
  const chartData = useMemo(() => construirDadosGrafico(modal.historico), [modal.historico])

  // domain=['auto','auto'] deixa o Recharts escolher limites "redondos" pro
  // eixo Y — em variações pequenas (ex.: 150 → 151), isso costuma abrir um
  // range bem maior que os dados reais (ex.: 0-200), deixando a variação
  // visualmente imperceptível mesmo com os pontos corretos. Calculando o
  // domínio a partir do min/max real dos dados (+ margem proporcional), a
  // variação sempre fica visível, não importa a magnitude do preço.
  const chartYDomain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [0, 1]
    const valores = chartData.map(d => d.preco_novo)
    const min = Math.min(...valores)
    const max = Math.max(...valores)
    if (min === max) {
      const pad = Math.max(min * 0.05, 0.01)
      return [min - pad, max + pad]
    }
    const pad = (max - min) * 0.15
    return [min - pad, max + pad]
  }, [chartData])

  // Fecha só quando o mousedown E o click começaram no próprio backdrop —
  // evita fechar ao selecionar texto dentro do modal e soltar o botão fora.
  const mouseDownOnBackdrop = useRef(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose()
        mouseDownOnBackdrop.current = false
      }}>
      <div className="mx-4 w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Histórico de preço</h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">
              {modal.insumo.codigo} — {modal.insumo.descricao}
            </p>
          </div>
          <button onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Cotações — fornecedor/data/observações de cada edição feita pelo
            modal de cotação. Entradas de preço anteriores a essa
            funcionalidade não aparecem aqui (só na tabela "Anterior/Novo"
            abaixo) — não há migração retroativa. */}
        {!modal.loading && modal.cotacoes.length > 0 && (
          <div className="mb-4">
            <p className="mb-1.5 text-xs font-medium text-gray-500">Cotações registradas</p>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 max-h-40 overflow-y-auto">
              {modal.cotacoes.map(c => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                  <span className="w-20 shrink-0 tabular-nums text-gray-400">{fmtDataCotacao(c.data_cotacao) !== '—' ? fmtDataCotacao(c.data_cotacao) : fmtDataCurta(c.created_at)}</span>
                  <span className="w-24 shrink-0 truncate font-medium text-gray-700" title={c.fornecedor ?? undefined}>{c.fornecedor ?? <span className="font-normal text-gray-300">sem fornecedor</span>}</span>
                  <span className="w-24 shrink-0 text-right tabular-nums text-gray-900">{fmtMoeda(c.valor)}</span>
                  <span className="flex-1 min-w-0 truncate text-gray-400" title={c.observacoes ?? undefined}>{c.observacoes}</span>
                  {c.estimado && <EstimadoBadge estimado estimadoMotivo={c.estimado_motivo} />}
                  {c.ativa && <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">em uso</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {modal.loading ? (
          <p className="py-8 text-center text-sm text-gray-400">Carregando…</p>
        ) : modal.historico.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm text-gray-400">Nenhuma alteração de preço registrada.</p>
            <p className="text-xs text-gray-300 mt-1">O histórico é gravado a partir de agora em cada edição manual.</p>
          </div>
        ) : (
          <>
            {chartData.length > 1 && (
              <div className="mb-4">
                <p className="mb-1.5 text-xs font-medium text-gray-500">Variação de preço</p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 8, right: 12, bottom: 0, left: 4 }}
                  >
                    <XAxis
                      dataKey="created_at"
                      tickFormatter={fmtDataCurta}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      minTickGap={24}
                    />
                    <YAxis
                      dataKey="preco_novo"
                      tickFormatter={fmtMoedaCompacta}
                      tickLine={false}
                      axisLine={false}
                      width={64}
                      tick={{ fontSize: 11, fill: '#9ca3af' }}
                      domain={chartYDomain}
                      allowDecimals
                    />
                    <Tooltip content={<HistoricoChartTooltip />} cursor={{ stroke: '#e5e7eb' }} />
                    <Line
                      type="monotone"
                      dataKey="preco_novo"
                      stroke={COR_LINHA}
                      strokeWidth={2}
                      dot={{ r: 4, fill: COR_LINHA, strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="rounded-lg border border-gray-200 max-h-96 overflow-y-auto overflow-x-auto">
            <table className="w-full min-w-[460px] text-sm">
              <thead className="border-b bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-600">Data</th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-600">Anterior</th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-600">Novo</th>
                  <th className="px-3 py-2.5 text-right font-medium text-gray-600">Var.</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-600">Fornecedor</th>
                  <th className="px-3 py-2.5 text-left font-medium text-gray-600">Usuário</th>
                  <th className="sticky right-0 top-0 w-8 bg-gray-50 px-1 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {modal.historico.map(h => {
                  const anterior = h.preco_anterior ?? 0
                  const diff = h.preco_novo - anterior
                  const pct = anterior > 0 ? (diff / anterior) * 100 : null
                  return (
                    <tr key={h.id} className="group hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-gray-600 tabular-nums text-xs whitespace-nowrap" title={fmtDataHora(h.created_at)}>{fmtDataCurta(h.created_at)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-500 text-xs">
                        {h.preco_anterior != null ? fmtMoeda(h.preco_anterior) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium text-gray-900 text-xs">
                        {fmtMoeda(h.preco_novo)}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-medium ${
                        diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-gray-400'
                      }`}>
                        {pct != null
                          ? `${diff > 0 ? '+' : ''}${pct.toFixed(1)}%`
                          : h.preco_anterior == null ? 'novo' : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs truncate max-w-[110px]" title={h.observacoes ?? undefined}>
                        {h.fornecedor ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 text-xs truncate max-w-[90px]" title={h.usuario ?? undefined}>
                        {h.usuario ?? '—'}
                      </td>
                      <td className="sticky right-0 bg-white px-1 py-2.5 group-hover:bg-gray-50">
                        <button onClick={() => onExcluirRegistro(h)}
                          title="Remover este registro do histórico"
                          className="opacity-0 group-hover:opacity-100 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-all">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
