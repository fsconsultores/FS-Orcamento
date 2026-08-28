'use client'

import { useState } from 'react'
import { GitCompare, ChevronDown, ChevronRight } from 'lucide-react'
import { compararRevisoesAction } from './versoes-action'
import type { ComparacaoRevisoes } from '@/lib/orcamento/revisoes'
import { formatCurrency } from '@/lib/costs'

/**
 * Sparkline em SVG puro (sem recharts) — leve o bastante pra desenhar uma
 * por linha da tabela sem custo perceptível, mesmo com dezenas de insumos
 * mudados de uma vez. Cor segue a mesma convenção do modal de histórico de
 * preço: vermelho = subiu, verde = caiu, do primeiro ao último valor
 * presente (revisões onde o insumo não existe ainda não entram no traçado).
 */
function Sparkline({ precos }: { precos: (number | null)[] }) {
  const pontos = precos
    .map((p, i) => (p != null ? { i, p } : null))
    .filter((x): x is { i: number; p: number } => x != null)
  if (pontos.length < 2) return <span className="text-xs text-gray-300">—</span>

  const w = 64
  const h = 24
  const pad = 3
  const min = Math.min(...pontos.map(x => x.p))
  const max = Math.max(...pontos.map(x => x.p))
  const xScale = (i: number) => pad + (precos.length === 1 ? 0 : (i / (precos.length - 1)) * (w - pad * 2))
  const yScale = (v: number) => (min === max ? h / 2 : h - pad - ((v - min) / (max - min)) * (h - pad * 2))

  const primeiro = pontos[0].p
  const ultimo = pontos[pontos.length - 1].p
  const cor = ultimo > primeiro ? '#dc2626' : ultimo < primeiro ? '#16a34a' : '#9ca3af'
  const path = pontos.map(({ i, p }) => `${xScale(i)},${yScale(p)}`).join(' ')

  return (
    <svg width={w} height={h} className="shrink-0" role="img" aria-label="Evolução do preço">
      <polyline points={path} fill="none" stroke={cor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {pontos.map(({ i, p }) => (
        <circle key={i} cx={xScale(i)} cy={yScale(p)} r={1.5} fill={cor} />
      ))}
    </svg>
  )
}

export function ComparacaoPrecos({ orcamentoId }: { orcamentoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const [dados, setDados] = useState<ComparacaoRevisoes | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function alternar() {
    if (aberto) { setAberto(false); return }
    setAberto(true)
    if (dados || carregando) return
    setCarregando(true)
    setErro(null)
    try {
      setDados(await compararRevisoesAction(orcamentoId))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar a comparação. Tente novamente.')
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        onClick={alternar}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
          <GitCompare size={15} className="text-gray-400" />
          Comparar preços entre revisões
        </span>
        {aberto ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>

      {aberto && (
        <div className="border-t border-gray-100 p-4">
          {carregando && <p className="py-6 text-center text-sm text-gray-400">Comparando revisões…</p>}
          {erro && <p className="py-6 text-center text-sm text-red-600">{erro}</p>}
          {dados && !carregando && !erro && (
            dados.insumos.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                Nenhum insumo avulso mudou de preço entre as {dados.revisoes.length} revisões desta família.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="border-b bg-gray-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left font-medium text-gray-600">Código</th>
                      <th className="px-3 py-2.5 text-left font-medium text-gray-600">Descrição</th>
                      {dados.revisoes.map(r => (
                        <th key={r.id} className="whitespace-nowrap px-3 py-2.5 text-right font-medium text-gray-600">
                          Rev. {r.numero_revisao}
                        </th>
                      ))}
                      <th className="px-3 py-2.5 text-right font-medium text-gray-600">Var.</th>
                      <th className="px-3 py-2.5 text-center font-medium text-gray-600">Evolução</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dados.insumos.map(ins => {
                      const presentes = ins.precos.filter((p): p is number => p != null)
                      const primeiro = presentes[0]
                      const ultimo = presentes[presentes.length - 1]
                      const diff = ultimo - primeiro
                      const pct = primeiro > 0 ? (diff / primeiro) * 100 : null
                      return (
                        <tr key={ins.codigo} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-gray-500">{ins.codigo}</td>
                          <td className="max-w-[220px] truncate px-3 py-2.5 text-gray-700" title={ins.descricao}>{ins.descricao}</td>
                          {ins.precos.map((p, i) => {
                            const anterior = ins.precos.slice(0, i).reverse().find(v => v != null) ?? null
                            const mudouAqui = p != null && anterior != null && p !== anterior
                            const corCelula = p == null
                              ? 'text-gray-300'
                              : mudouAqui
                              ? (p > anterior! ? 'font-medium text-red-600' : 'font-medium text-green-600')
                              : 'text-gray-700'
                            return (
                              <td key={i} className={`px-3 py-2.5 text-right tabular-nums text-xs ${corCelula}`}>
                                {p != null ? formatCurrency(p) : '—'}
                              </td>
                            )
                          })}
                          <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-medium ${
                            diff > 0 ? 'text-red-600' : diff < 0 ? 'text-green-600' : 'text-gray-400'
                          }`}>
                            {pct != null ? `${diff > 0 ? '+' : ''}${pct.toFixed(1)}%` : '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex justify-center">
                              <Sparkline precos={ins.precos} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
