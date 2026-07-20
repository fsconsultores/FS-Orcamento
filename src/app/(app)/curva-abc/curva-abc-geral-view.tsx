'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fmt, fmtQtd, fmtPct } from '@/lib/curva-abc'
import type { AbcItemGeral } from '@/lib/dashboard/curva-abc-geral'
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table'
import { AbcBadge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { ClientPagination } from '@/components/client-pagination'
import { PieChart } from 'lucide-react'

const PAGE_SIZE = 100

const ROW_BG: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-emerald-50/40',
  B: 'bg-amber-50/40',
  C: 'bg-rose-50/20',
}

export function CurvaAbcGeralView({ items }: { items: AbcItemGeral[] }) {
  const [filtro, setFiltro] = useState<'todos' | 'A' | 'B' | 'C'>('todos')
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [filtro])

  const filtered = filtro === 'todos' ? items : items.filter(i => i.classe === filtro)
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const total = items.reduce((s, i) => s + i.valor_total, 0)

  const byClasse = (c: 'A' | 'B' | 'C') => items.filter(i => i.classe === c)

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<PieChart size={18} />}
        title="Sem itens calculados ainda"
        description="Assim que suas planilhas tiverem itens calculados, eles aparecem aqui."
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Total Geral</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{fmt(total)}</p>
          <p className="mt-0.5 text-xs text-gray-400">{items.length} itens</p>
        </div>
        {(['A', 'B', 'C'] as const).map((c) => {
          const cls = byClasse(c)
          const sum = cls.reduce((s, i) => s + i.valor_total, 0)
          const pct = total > 0 ? ((sum / total) * 100).toFixed(1) : '0.0'
          const colors = {
            A: { border: 'border-emerald-200', bg: 'bg-emerald-50', title: 'text-emerald-700', val: 'text-emerald-900', sub: 'text-emerald-500' },
            B: { border: 'border-amber-200', bg: 'bg-amber-50', title: 'text-amber-700', val: 'text-amber-900', sub: 'text-amber-500' },
            C: { border: 'border-rose-200', bg: 'bg-rose-50', title: 'text-rose-700', val: 'text-rose-900', sub: 'text-rose-500' },
          }[c]
          return (
            <div key={c} className={`rounded-xl border ${colors.border} ${colors.bg} p-4 shadow-sm`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${colors.title}`}>Classe {c}</p>
              <p className={`mt-1 text-xl font-bold tabular-nums ${colors.val}`}>{fmt(sum)}</p>
              <p className={`mt-0.5 text-xs ${colors.sub}`}>{cls.length} itens · {pct}% do total</p>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {([
          { v: 'todos', label: 'Todos' },
          { v: 'A', label: 'Classe A' },
          { v: 'B', label: 'Classe B' },
          { v: 'C', label: 'Classe C' },
        ] as const).map(({ v, label }) => {
          const active = filtro === v
          const activeClass =
            v === 'todos' ? 'bg-primary-700 text-white border-primary-700' :
            v === 'A' ? 'bg-emerald-600 text-white border-emerald-600' :
            v === 'B' ? 'bg-amber-500 text-white border-amber-500' :
            'bg-rose-600 text-white border-rose-600'
          return (
            <button
              key={v}
              onClick={() => setFiltro(v)}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${active ? activeClass : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {label}
            </button>
          )
        })}
      </div>

      <Table>
        <Thead>
          <Th className="w-10 text-right">#</Th>
          <Th>Orçamento</Th>
          <Th className="w-28">Código</Th>
          <Th>Descrição</Th>
          <Th className="w-14 text-center">Und</Th>
          <Th className="w-28 text-right">Quantidade</Th>
          <Th className="w-32 text-right">Custo Unit.</Th>
          <Th className="w-32 text-right">Valor Total</Th>
          <Th className="w-16 text-right">%</Th>
          <Th className="w-20 text-right">% Acum.</Th>
          <Th className="w-16 text-center">Classe</Th>
        </Thead>
        <Tbody>
          {paged.map((item, idx) => (
            <Tr key={`${item.orcamento_id}-${item.codigo}-${idx}`} className={ROW_BG[item.classe]}>
              <Td className="text-right font-mono text-xs tabular-nums text-gray-400">
                {(page - 1) * PAGE_SIZE + idx + 1}
              </Td>
              <Td className="max-w-[160px] truncate">
                <Link href={`/orcamentos/${item.orcamento_id}` as any} className="text-primary-700 hover:underline">
                  {item.orcamento_nome}
                </Link>
              </Td>
              <Td className="font-mono text-xs text-gray-600">{item.codigo ?? '—'}</Td>
              <Td className="text-gray-900">{item.descricao}</Td>
              <Td className="text-center text-xs text-gray-500">{item.unidade ?? '—'}</Td>
              <Td className="text-right tabular-nums text-gray-700">{fmtQtd(item.quantidade)}</Td>
              <Td className="text-right tabular-nums text-gray-700">{fmt(item.custo_unitario)}</Td>
              <Td className="text-right tabular-nums font-semibold text-gray-900">{fmt(item.valor_total)}</Td>
              <Td className="text-right tabular-nums text-gray-600">{fmtPct(item.percentual)}</Td>
              <Td className="text-right tabular-nums text-gray-600">{fmtPct(item.percentual_acumulado)}</Td>
              <Td className="text-center"><AbcBadge classe={item.classe} /></Td>
            </Tr>
          ))}
          {filtered.length === 0 && (
            <Tr>
              <Td colSpan={11} className="py-8 text-center text-sm text-gray-400">Nenhum item nessa classe.</Td>
            </Tr>
          )}
        </Tbody>
      </Table>

      <ClientPagination total={filtered.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  )
}
