'use client'

import { useRouter } from 'next/navigation'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt } from '@/lib/curva-abc'
import { EmptyState } from '@/components/ui/empty-state'
import { Boxes } from 'lucide-react'
import type { CategoriaPorProjeto } from '@/lib/dashboard/curva-abc-geral'

// 3 primeiros slots da paleta categórica (skill dataviz) — únicos validados
// contra todos os pares em ambos os modos (worst-case CVD ΔE 9.2, normal-
// vision ΔE 24.0). Ordem fixa, nunca ciclada.
const COR_MATERIAIS = '#2a78d6'    // slot 1 — blue
const COR_EQUIPAMENTOS = '#eb6834' // slot 2 — orange
const COR_SERVICOS = '#1baf7a'     // slot 3 — aqua

const SERIES: { key: keyof Pick<CategoriaPorProjeto, 'materiais' | 'equipamentos' | 'servicos'>; label: string; cor: string }[] = [
  { key: 'materiais', label: 'Materiais', cor: COR_MATERIAIS },
  { key: 'equipamentos', label: 'Equipamentos', cor: COR_EQUIPAMENTOS },
  { key: 'servicos', label: 'Serviços', cor: COR_SERVICOS },
]

function Legenda() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
      {SERIES.map(s => (
        <span key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.cor }} />
          {s.label}
        </span>
      ))}
    </div>
  )
}

function TooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload as CategoriaPorProjeto
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-gray-800">{item.orcamentoNome}</p>
      {SERIES.map(s => (
        <p key={s.key} className="mt-0.5 flex items-center gap-1.5 tabular-nums text-gray-500">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.cor }} />
          {s.label}: {fmt(item[s.key])}
        </p>
      ))}
      <p className="mt-1 border-t border-gray-100 pt-1 font-medium tabular-nums text-gray-700">
        Total: {fmt(item.total)}
      </p>
    </div>
  )
}

export function ChartInsumosCategoria({ items }: { items: CategoriaPorProjeto[] }) {
  const router = useRouter()

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Boxes size={18} />}
        title="Sem insumos avulsos ainda"
        description="Assim que um orçamento tiver insumos com preço cadastrado, a distribuição por categoria aparece aqui."
      />
    )
  }

  const alturaBarra = 34
  const altura = Math.max(items.length * alturaBarra + 16, 120)

  return (
    <div>
      <Legenda />
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={items} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }} barCategoryGap={10}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="orcamentoNome"
            width={140}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: '#374151' }}
            tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
          />
          <Tooltip content={<TooltipContent />} cursor={{ fill: 'rgba(82,39,110,0.06)' }} />
          {SERIES.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="categoria"
              fill={s.cor}
              stroke="#ffffff"
              strokeWidth={2}
              maxBarSize={22}
              cursor="pointer"
              radius={i === SERIES.length - 1 ? [0, 4, 4, 0] : undefined}
              onClick={(d: any) => router.push(`/orcamentos/${d.orcamentoId}`)}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
