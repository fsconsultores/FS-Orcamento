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

  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={items} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={10}>
        <XAxis type="number" hide />
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
