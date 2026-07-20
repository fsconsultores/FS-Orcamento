'use client'

import { useRouter } from 'next/navigation'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { fmtPct } from '@/lib/curva-abc'
import type { ResumoClasseAbc } from '@/lib/dashboard/curva-abc-geral'
import { EmptyState } from '@/components/ui/empty-state'
import { PieChart as PieIcon } from 'lucide-react'

// Mesmas cores de status já usadas em AbcBadge (src/components/ui/badge.tsx)
// — A/B/C são classes de severidade/prioridade, não identidades livres, por
// isso reaproveitam a paleta de status do design system em vez da paleta
// categórica genérica da skill de dataviz.
const COR_CLASSE: Record<'A' | 'B' | 'C', string> = {
  A: '#059669', // emerald-600
  B: '#d97706', // amber-600
  C: '#dc2626', // red-600
}

const LABEL_CLASSE: Record<'A' | 'B' | 'C', string> = {
  A: 'Classe A',
  B: 'Classe B',
  C: 'Classe C',
}

const DESCRICAO_CLASSE: Record<'A' | 'B' | 'C', string> = {
  A: 'alto impacto',
  B: 'impacto médio',
  C: 'baixo impacto',
}

function TooltipContent({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload as ResumoClasseAbc
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-gray-800">{LABEL_CLASSE[item.classe]}</p>
      <p className="mt-0.5 text-gray-500">{item.quantidade.toLocaleString('pt-BR')} itens · {fmtPct(item.percentualFinanceiro)} do valor</p>
    </div>
  )
}

export function ChartCurvaAbc({ resumo }: { resumo: ResumoClasseAbc[] }) {
  const router = useRouter()
  const totalItens = resumo.reduce((s, r) => s + r.quantidade, 0)

  if (totalItens === 0) {
    return (
      <EmptyState
        icon={<PieIcon size={18} />}
        title="Sem itens calculados ainda"
        description="A Curva ABC Geral aparece assim que houver planilhas com itens calculados."
      />
    )
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="mx-auto h-40 w-40 shrink-0 sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={resumo}
              dataKey="percentualFinanceiro"
              nameKey="classe"
              cx="50%"
              cy="50%"
              innerRadius={44}
              outerRadius={68}
              paddingAngle={2}
              cornerRadius={3}
              cursor="pointer"
              onClick={() => router.push('/curva-abc')}
            >
              {resumo.map((r) => (
                <Cell key={r.classe} fill={COR_CLASSE[r.classe]} stroke="#fff" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip content={<TooltipContent />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {resumo.map((r) => (
          <li key={r.classe} className="flex items-center gap-2.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COR_CLASSE[r.classe] }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-gray-700">{LABEL_CLASSE[r.classe]}</span>
              <span className="block truncate text-xs text-gray-400">{DESCRICAO_CLASSE[r.classe]} · {r.quantidade.toLocaleString('pt-BR')} itens</span>
            </span>
            <span className="w-14 shrink-0 text-right font-medium tabular-nums text-gray-800">{fmtPct(r.percentualFinanceiro)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
