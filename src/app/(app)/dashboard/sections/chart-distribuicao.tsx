'use client'

import { useRouter } from 'next/navigation'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt } from '@/lib/curva-abc'
import { EmptyState } from '@/components/ui/empty-state'
import { BarChart3 } from 'lucide-react'

export interface DistribuicaoItem {
  id: string
  nome: string
  valor: number
}

const COR_BARRA = '#52276E' // primary-700 — magnitude única, um só hue (ver skill dataviz)

function TooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload as DistribuicaoItem
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-gray-800">{item.nome}</p>
      <p className="mt-0.5 tabular-nums text-gray-500">{fmt(item.valor)}</p>
    </div>
  )
}

export function ChartDistribuicao({ items }: { items: DistribuicaoItem[] }) {
  const router = useRouter()

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={18} />}
        title="Sem orçamentos calculados ainda"
        description="Assim que um orçamento tiver valor calculado, ele aparece aqui."
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
          dataKey="nome"
          width={140}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: '#374151' }}
          tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
        />
        <Tooltip content={<TooltipContent />} cursor={{ fill: 'rgba(82,39,110,0.06)' }} />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]} maxBarSize={22} cursor="pointer" onClick={(d: any) => router.push(`/orcamentos/${d.id}`)}>
          {items.map((item) => (
            <Cell key={item.id} fill={COR_BARRA} />
          ))}
          <LabelList
            dataKey="valor"
            position="right"
            formatter={(v: any) => fmt(Number(v))}
            style={{ fontSize: 11, fill: '#6b7280' }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
