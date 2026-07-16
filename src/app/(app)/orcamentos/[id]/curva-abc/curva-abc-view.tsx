'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, FileText, Printer, BarChart3 } from 'lucide-react'
import type { AbcItem, AbcItemComCategoria, CategoriaAbc } from '@/lib/curva-abc'
import { fmt, fmtQtd, fmtPct } from '@/lib/curva-abc'
import { exportCurvaAbcPdf } from './export-pdf'
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table'
import { AbcBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/toast'
import { ClientPagination } from '@/components/client-pagination'

// Mesmo tamanho de página usado em Insumos/Composições — mantém a tabela
// leve mesmo em orçamentos com milhares de itens na Curva ABC.
const PAGE_SIZE = 100

// ─── Chart ───────────────────────────────────────────────────────────────────

function AbcChart({ items }: { items: AbcItem[] }) {
  if (items.length === 0) return null

  const W = 800
  const H = 290
  const pL = 50   // left padding (Y axis)
  const pR = 20   // right padding
  const pT = 24   // top padding
  const pB = 36   // bottom padding (X axis label)
  const cW = W - pL - pR   // chart width  (730)
  const cH = H - pT - pB   // chart height (230)

  const N = items.length
  const countA = items.filter(i => i.classe === 'A').length
  const countB = items.filter(i => i.classe === 'B').length
  const fA = countA / N
  const fAB = (countA + countB) / N

  const toSvgX = (frac: number) => pL + frac * cW
  const toSvgY = (pct: number) => pT + cH - (pct / 100) * cH

  // Cumulative line points (starts at origin 0,0)
  const linePoints: string[] = [`${toSvgX(0)},${toSvgY(0)}`]
  items.forEach((item, i) => {
    linePoints.push(`${toSvgX((i + 1) / N)},${toSvgY(item.percentual_acumulado)}`)
  })

  const yGridLines = [20, 40, 60, 80, 95, 100]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 320 }}>
      {/* Background zones */}
      <rect x={toSvgX(0)} y={pT} width={fA * cW} height={cH} fill="#f0fdf4" />
      <rect x={toSvgX(fA)} y={pT} width={(fAB - fA) * cW} height={cH} fill="#fffbeb" />
      <rect x={toSvgX(fAB)} y={pT} width={(1 - fAB) * cW} height={cH} fill="#fff1f2" />

      {/* Y grid lines */}
      {yGridLines.map(pct => (
        <line
          key={pct}
          x1={pL} y1={toSvgY(pct)}
          x2={pL + cW} y2={toSvgY(pct)}
          stroke={pct === 80 || pct === 95 ? '#9ca3af' : '#e5e7eb'}
          strokeWidth={pct === 80 || pct === 95 ? 1.5 : 0.8}
          strokeDasharray={pct === 80 || pct === 95 ? '4 3' : undefined}
        />
      ))}

      {/* Vertical zone separators */}
      {countA > 0 && countA < N && (
        <line
          x1={toSvgX(fA)} y1={pT}
          x2={toSvgX(fA)} y2={pT + cH}
          stroke="#16a34a" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7}
        />
      )}
      {countB > 0 && countA + countB < N && (
        <line
          x1={toSvgX(fAB)} y1={pT}
          x2={toSvgX(fAB)} y2={pT + cH}
          stroke="#d97706" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7}
        />
      )}

      {/* Axes */}
      <line x1={pL} y1={pT} x2={pL} y2={pT + cH} stroke="#d1d5db" strokeWidth={1} />
      <line x1={pL} y1={pT + cH} x2={pL + cW} y2={pT + cH} stroke="#d1d5db" strokeWidth={1} />

      {/* Y axis labels */}
      {yGridLines.map(pct => (
        <text key={pct} x={pL - 5} y={toSvgY(pct) + 4} textAnchor="end" fontSize={9} fill="#6b7280">
          {pct}%
        </text>
      ))}
      <text x={pL - 5} y={toSvgY(0) + 4} textAnchor="end" fontSize={9} fill="#6b7280">0%</text>

      {/* Reference labels (right side) */}
      <text x={pL + cW + 4} y={toSvgY(80) + 4} fontSize={9} fill="#16a34a" fontWeight="600">80%</text>
      <text x={pL + cW + 4} y={toSvgY(95) + 4} fontSize={9} fill="#d97706" fontWeight="600">95%</text>

      {/* Zone labels (top) */}
      {countA > 0 && (
        <text x={toSvgX(fA / 2)} y={pT + 13} textAnchor="middle" fontSize={11} fill="#16a34a" fontWeight="700">A</text>
      )}
      {countB > 0 && (
        <text x={toSvgX((fA + fAB) / 2)} y={pT + 13} textAnchor="middle" fontSize={11} fill="#d97706" fontWeight="700">B</text>
      )}
      {N - countA - countB > 0 && (
        <text x={toSvgX((fAB + 1) / 2)} y={pT + 13} textAnchor="middle" fontSize={11} fill="#dc2626" fontWeight="700">C</text>
      )}

      {/* Cumulative curve */}
      <polyline points={linePoints.join(' ')} fill="none" stroke="#344DA1" strokeWidth={2} strokeLinejoin="round" />

      {/* X axis label */}
      <text x={pL + cW / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="#9ca3af">
        Itens ordenados por valor ({N} itens)
      </text>
    </svg>
  )
}

// ─── Cor de fundo por classe (tint sutil de linha, não é ação/marca — mantém semântica A/B/C) ──

const ROW_BG: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-emerald-50/40',
  B: 'bg-amber-50/40',
  C: 'bg-rose-50/20',
}

// ─── Main component ───────────────────────────────────────────────────────────

type CategoriaFiltro = 'todas' | CategoriaAbc

const CATEGORIA_LABELS: Record<CategoriaFiltro, string> = {
  todas: 'Todos',
  materiais: 'Materiais',
  mao_de_obra: 'Mão de Obra',
  equipamentos: 'Equipamentos',
  servicos: 'Serviços',
}

export function CurvaAbcView({
  orcamentoId,
  items: todosItens,
  orcamentoNome,
}: {
  orcamentoId: string
  items: AbcItemComCategoria[]
  orcamentoNome?: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const toast = useToast()
  const [categoria, setCategoria] = useState<CategoriaFiltro>('todas')
  const [filtro, setFiltro] = useState<'todos' | 'A' | 'B' | 'C'>('todos')
  const [exportandoPdf, setExportandoPdf] = useState(false)
  const [editandoCodigo, setEditandoCodigo] = useState<string | null>(null)
  const [salvandoCodigo, setSalvandoCodigo] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  // A curva ABC é uma só (percentuais/classes calculados uma única vez sobre
  // todos os itens); o filtro por categoria só restringe quais linhas aparecem,
  // sem recalcular percentual/acumulado/classe.
  const items = categoria === 'todas' ? todosItens : todosItens.filter(i => i.categoria === categoria)
  const filtered = filtro === 'todos' ? items : items.filter(i => i.classe === filtro)

  useEffect(() => { setCurrentPage(1) }, [categoria, filtro])

  // Rank (posição no ranking) por item — precomputado em O(n) numa Map, em
  // vez de items.indexOf(item) dentro do .map() de renderização, que era
  // O(n) por linha (O(n²) no total, sensível em orçamentos com milhares de
  // itens na Curva ABC).
  const rankMap = useMemo(() => new Map(items.map((it, i) => [it, i + 1])), [items])

  // Impressão (window.print) captura o DOM atual — com paginação ativa isso
  // cortaria linhas fora da página corrente. Enquanto `printing`, a tabela
  // renderiza a lista inteira; volta a paginar assim que o diálogo fecha.
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onAfterPrint = () => setPrinting(false)
    window.addEventListener('afterprint', onAfterPrint)
    return () => window.removeEventListener('afterprint', onAfterPrint)
  }, [])
  function handlePrint() {
    setPrinting(true)
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
  }

  const paged = printing ? filtered : filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const total = items.reduce((s, i) => s + i.valor_total, 0)
  const byClass = (c: 'A' | 'B' | 'C') => items.filter(i => i.classe === c)

  async function handleSalvarCusto(item: AbcItemComCategoria, rawValue: string) {
    setEditandoCodigo(null)
    if (!item.codigo) return
    const str = rawValue.trim().replace(',', '.')
    const parsed = str === '' ? 0 : parseFloat(str)
    if (isNaN(parsed) || parsed < 0 || parsed === item.custo_unitario) return

    setSalvandoCodigo(item.codigo)
    try {
      const { atualizarPrecoInsumoAction } = await import('../atualizar-preco-insumo-action')
      await atualizarPrecoInsumoAction(orcamentoId, item.codigo, parsed, {
        descricao: item.descricao,
        unidade: item.unidade ?? undefined,
      })
      startTransition(() => router.refresh())
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível salvar o novo custo. Tente novamente.', 'error')
    } finally {
      setSalvandoCodigo(null)
    }
  }

  async function handleExportXlsx() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'FS Orçamento'
    const sheetName = `Curva ABC${categoria === 'todas' ? '' : ' - ' + CATEGORIA_LABELS[categoria]}`
    const ws = wb.addWorksheet(sheetName)

    const C = {
      hBg: 'FF1E40AF', hFg: 'FFFFFFFF',
      aBg: 'FFD1FAE5', bBg: 'FFFEF3C7', cBg: 'FFFEE2E2',
      totBg: 'FFF1F5F9', dark: 'FF1E293B', border: 'FFCBD5E1',
    }
    const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
    const bdr  = () => { const b = { style: 'thin' as const, color: { argb: C.border } }; return { top: b, bottom: b, left: b, right: b } }

    ws.columns = [
      { width: 5 }, { width: 14 }, { width: 45 }, { width: 6 },
      { width: 12 }, { width: 16 }, { width: 16 }, { width: 11 }, { width: 11 }, { width: 8 },
    ]

    // Cabeçalho
    const headers = ['#', 'Código', 'Descrição', 'Und', 'Quantidade', 'Custo Unit. (R$)', 'Valor Total (R$)', '% Individual', '% Acumulado', 'Classe']
    const hRow = ws.addRow(headers)
    hRow.height = 18
    hRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = fill(C.hBg)
      cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.hFg } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = bdr()
    })

    // Linhas de dados — todos os valores são strings/números (sem null) para garantir
    // que eachCell itere todas as 10 colunas
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const bg = item.classe === 'A' ? C.aBg : item.classe === 'B' ? C.bBg : C.cBg
      const row = ws.addRow([
        i + 1,
        item.codigo ?? '',
        item.descricao,
        item.unidade ?? '',
        item.quantidade,
        item.custo_unitario,
        item.valor_total,
        +item.percentual.toFixed(4),
        +item.percentual_acumulado.toFixed(4),
        item.classe,
      ])
      row.height = 14
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.fill = fill(bg)
        cell.font = { name: 'Calibri', size: 9, bold: c === 10, color: { argb: C.dark } }
        cell.alignment = { horizontal: c === 1 || c >= 5 ? 'right' : c === 4 || c === 10 ? 'center' : 'left', vertical: 'middle' }
        cell.border = bdr()
        if ((c === 5 || c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
        if ((c === 8 || c === 9) && typeof cell.value === 'number')            cell.numFmt = '#,##0.00##'
      })
    }

    // Total
    const tRow = ws.addRow(['', '', `${items.length} itens`, '', '', 'TOTAL', total, '', '', ''])
    tRow.height = 16
    tRow.eachCell({ includeEmpty: true }, (cell, c) => {
      cell.fill = fill(C.totBg)
      cell.font = { name: 'Calibri', size: 9, bold: c === 3 || c === 6 || c === 7, color: { argb: C.dark } }
      cell.alignment = { horizontal: c === 6 || c >= 5 ? 'right' : 'left', vertical: 'middle' }
      cell.border = bdr()
      if (c === 7 && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
    })

    const buf = await wb.xlsx.writeBuffer()
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a   = document.createElement('a')
    a.href = url; a.download = `curva_abc_${categoria}_${new Date().toISOString().split('T')[0]}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleExportPdf() {
    setExportandoPdf(true)
    try {
      await exportCurvaAbcPdf(items, categoria === 'todas' ? 'geral' : categoria, orcamentoNome)
    } finally {
      setExportandoPdf(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* KPIs — primeira coisa que o orçamentista vê, antes de qualquer filtro */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Geral</p>
          <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{fmt(total)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{items.length} itens</p>
        </div>
        {(['A', 'B', 'C'] as const).map(c => {
          const cls = byClass(c)
          const sum = cls.reduce((s, i) => s + i.valor_total, 0)
          const pct = total > 0 ? ((sum / total) * 100).toFixed(1) : '0.0'
          const threshold = c === 'A' ? '≤ 80%' : c === 'B' ? '80–95%' : '> 95%'
          const colors = {
            A: { border: 'border-emerald-200', bg: 'bg-emerald-50', title: 'text-emerald-700', val: 'text-emerald-900', sub: 'text-emerald-500' },
            B: { border: 'border-amber-200', bg: 'bg-amber-50', title: 'text-amber-700', val: 'text-amber-900', sub: 'text-amber-500' },
            C: { border: 'border-rose-200', bg: 'bg-rose-50', title: 'text-rose-700', val: 'text-rose-900', sub: 'text-rose-500' },
          }[c]
          return (
            <div key={c} className={`rounded-xl border ${colors.border} ${colors.bg} p-4 shadow-sm`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${colors.title}`}>
                Classe {c} <span className="font-normal">({threshold})</span>
              </p>
              <p className={`text-xl font-bold mt-1 tabular-nums ${colors.val}`}>{fmt(sum)}</p>
              <p className={`text-xs mt-0.5 ${colors.sub}`}>{cls.length} itens · {pct}% do total</p>
            </div>
          )
        })}
      </div>

      {/* Filtro por categoria — a curva é única; isto só restringe as linhas exibidas */}
      <div className="flex flex-wrap gap-1.5">
        {(['todas', 'materiais', 'mao_de_obra', 'equipamentos', 'servicos'] as const).map((key) => {
          const count = key === 'todas' ? todosItens.length : todosItens.filter(i => i.categoria === key).length
          const active = categoria === key
          return (
            <button
              key={key}
              onClick={() => { setCategoria(key); setFiltro('todos') }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                active
                  ? 'bg-primary-700 border-primary-700 text-white'
                  : 'bg-white border-gray-300 text-gray-600 hover:border-primary-400'
              }`}
            >
              {CATEGORIA_LABELS[key]}
              <span className={active ? 'ml-1.5 text-primary-100' : 'ml-1.5 text-gray-400'}>({count})</span>
            </button>
          )
        })}
      </div>

      {/* Chart */}
      {items.length > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Curva ABC Acumulada</p>
          <AbcChart items={items} />
          <div className="flex gap-4 mt-2 justify-center">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="inline-block w-6 h-0.5 rounded" style={{ backgroundColor: '#344DA1' }} />
              % acumulado
            </span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300" />
              Classe A
            </span>
            <span className="flex items-center gap-1.5 text-xs text-amber-600">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-100 border border-amber-300" />
              Classe B
            </span>
            <span className="flex items-center gap-1.5 text-xs text-rose-600">
              <span className="inline-block w-3 h-3 rounded-sm bg-rose-100 border border-rose-300" />
              Classe C
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <EmptyState
            icon={<BarChart3 size={20} />}
            title="Nenhum dado disponível"
            description="Importe itens na aba Planilha para gerar a Curva ABC."
          />
        </div>
      )}

      {/* Toolbar única: filtro de classe + ações rápidas */}
      <div className="flex items-center justify-between flex-wrap gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex gap-1">
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
                className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${active ? activeClass : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportXlsx} disabled={items.length === 0} icon={<Download size={14} />}>
            Exportar XLSX
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={items.length === 0} loading={exportandoPdf} icon={<FileText size={14} />}>
            {exportandoPdf ? 'Gerando PDF…' : 'Exportar PDF'}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} disabled={items.length === 0} icon={<Printer size={14} />}>
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {/* Tabela */}
      <Table className="print:shadow-none print:border-0">
        <Thead>
          <Th className="w-10 text-right">#</Th>
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
          {paged.map(item => {
            const rank = rankMap.get(item)!
            return (
              <Tr key={rank} className={ROW_BG[item.classe]}>
                <Td className="text-right font-mono text-xs text-gray-400 tabular-nums">{rank}</Td>
                <Td className="font-mono text-xs text-gray-600">{item.codigo ?? '—'}</Td>
                <Td className="text-gray-900">{item.descricao}</Td>
                <Td className="text-center text-xs text-gray-500">{item.unidade ?? '—'}</Td>
                <Td className="text-right tabular-nums text-gray-700">{fmtQtd(item.quantidade)}</Td>
                <Td className="text-right">
                  {item.codigo && editandoCodigo === item.codigo ? (
                    <input
                      autoFocus
                      type="number"
                      min="0"
                      step="any"
                      defaultValue={item.custo_unitario}
                      onBlur={e => handleSalvarCusto(item, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); handleSalvarCusto(item, (e.target as HTMLInputElement).value) }
                        if (e.key === 'Escape') { e.preventDefault(); setEditandoCodigo(null) }
                      }}
                      className="block w-full text-right rounded border border-primary-400 bg-white px-2 py-0.5 text-sm outline-none ring-2 ring-primary-400/20 tabular-nums"
                    />
                  ) : (
                    <span
                      onClick={() => item.codigo && setEditandoCodigo(item.codigo)}
                      className={`block tabular-nums ${item.codigo ? 'cursor-pointer hover:underline decoration-dotted' : ''} ${salvandoCodigo === item.codigo ? 'text-gray-400' : 'text-gray-700'}`}
                      title={item.codigo ? 'Clique para editar' : undefined}
                    >
                      {salvandoCodigo === item.codigo ? '…' : fmt(item.custo_unitario)}
                    </span>
                  )}
                </Td>
                <Td className="text-right tabular-nums font-semibold text-gray-900">{fmt(item.valor_total)}</Td>
                <Td className="text-right tabular-nums text-gray-600">{fmtPct(item.percentual)}</Td>
                <Td className="text-right tabular-nums text-gray-600">{fmtPct(item.percentual_acumulado)}</Td>
                <Td className="text-center">
                  <AbcBadge classe={item.classe} />
                </Td>
              </Tr>
            )
          })}
          {filtered.length === 0 && (
            <Tr>
              <Td colSpan={10} className="py-8 text-center text-sm text-gray-400">
                {items.length === 0
                  ? 'Nenhum dado. Importe itens na planilha primeiro.'
                  : 'Nenhum item nessa classe.'}
              </Td>
            </Tr>
          )}
        </Tbody>
        {filtered.length > 0 && (
          <tfoot className="border-t border-gray-200 bg-gray-50">
            <tr>
              <td colSpan={6} className="px-4 py-2 text-right text-xs text-gray-500">
                {filtered.length} item(ns)
              </td>
              <td className="px-4 py-2 text-right tabular-nums font-bold text-gray-900 text-sm">
                {fmt(filtered.reduce((s, i) => s + i.valor_total, 0))}
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        )}
      </Table>

      <div className="print:hidden">
        <ClientPagination total={filtered.length} page={currentPage} pageSize={PAGE_SIZE} onPageChange={setCurrentPage} />
      </div>
    </div>
  )
}
