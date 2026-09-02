'use client'

import { useRouter } from 'next/navigation'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt } from '@/lib/curva-abc'
import { formatDateShort } from '@/lib/format-date'
import { EmptyState } from '@/components/ui/empty-state'
import { TrendingUpDown } from 'lucide-react'
import type { VariacaoPreco } from '@/lib/dashboard/curva-abc-geral'

// Mesma convenção já usada no modal de histórico de preço (aumento =
// vermelho, queda = verde) — src/app/(app)/orcamentos/[id]/insumos/
// historico-preco-modal.tsx. Hex do Tailwind red-600/green-600.
const COR_AUMENTO = '#dc2626'
const COR_QUEDA = '#16a34a'

function fmtPctSinal(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

function TooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload as VariacaoPreco
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-mono font-medium text-gray-800">{item.codigo}</p>
      <p className="mt-0.5 text-gray-500">{item.orcamentoNome}</p>
      <p className="mt-1 tabular-nums text-gray-500">
        {fmt(item.precoAnterior)} → <span className="font-medium text-gray-800">{fmt(item.precoNovo)}</span>
      </p>
      <p className="mt-0.5 text-gray-400">{formatDateShort(item.criadoEm)}</p>
    </div>
  )
}

export function ChartVariacaoPreco({ items }: { items: VariacaoPreco[] }) {
  const router = useRouter()

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUpDown size={18} />}
        title="Sem variações de preço registradas"
        description="Assim que um preço de insumo for editado manualmente, a variação aparece aqui."
      />
    )
  }

  const alturaBarra = 34
  const altura = Math.max(items.length * alturaBarra + 16, 120)

  // Um preço corrigido de um valor perto de zero (placeholder) pro preço real
  // produz uma % astronômica (visto em produção: +32.879.900%) que, numa
  // escala linear, deixa a barra dela sozinha ocupando o gráfico inteiro e
  // reduz TODAS as outras — inclusive a 2ª maior variação real — a um traço
  // invisível. O rótulo de texto continua mostrando o valor verdadeiro (não
  // mexe no dataKey nem no formatter); só o TETO VISUAL da barra é limitado
  // à 2ª maior magnitude de cada lado (com folga de 15%), então o único
  // outlier extremo aparece "estourando" o eixo (correto, é isso mesmo que
  // ele faz) mas o resto do ranking volta a ser comparável entre si.
  const positivos = items.filter(i => i.variacaoPct >= 0).map(i => i.variacaoPct).sort((a, b) => b - a)
  const negativos = items.filter(i => i.variacaoPct < 0).map(i => Math.abs(i.variacaoPct)).sort((a, b) => b - a)
  const tetoPositivo = (positivos.length > 1 ? positivos[1] : (positivos[0] ?? 0)) * 1.15
  const tetoNegativo = (negativos.length > 1 ? negativos[1] : (negativos[0] ?? 0)) * 1.15

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={items} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={10}>
        {/* allowDataOverflow: sem isso o Recharts IGNORA silenciosamente o teto
            do domain de cima e expande de volta pro valor real do outlier —
            gotcha conhecido da lib, é o motivo do domain sozinho não bastar. */}
        <XAxis type="number" hide domain={[negativos.length > 0 ? -tetoNegativo : 0, tetoPositivo]} allowDataOverflow />
        <YAxis
          type="category"
          dataKey="codigo"
          width={90}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fontFamily: 'monospace', fill: '#374151' }}
        />
        <Tooltip content={<TooltipContent />} cursor={{ fill: 'rgba(82,39,110,0.06)' }} />
        <Bar dataKey="variacaoPct" radius={[0, 4, 4, 0]} maxBarSize={22} cursor="pointer" onClick={(d: any) => router.push(`/orcamentos/${d.orcamentoId}/insumos`)}>
          {items.map((item) => (
            <Cell key={`${item.orcamentoId}-${item.codigo}`} fill={item.variacaoPct >= 0 ? COR_AUMENTO : COR_QUEDA} />
          ))}
          <LabelList
            dataKey="variacaoPct"
            position="right"
            formatter={(v: any) => fmtPctSinal(Number(v))}
            style={{ fontSize: 11, fill: '#6b7280' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
