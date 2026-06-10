'use client'

import { useState } from 'react'
import type { AbcItem } from '@/lib/curva-abc'
import { fmt, fmtQtd, fmtPct } from '@/lib/curva-abc'
import { exportCurvaAbcPdf } from './export-pdf'

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
      <polyline points={linePoints.join(' ')} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinejoin="round" />

      {/* X axis label */}
      <text x={pL + cW / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="#9ca3af">
        Itens ordenados por valor ({N} itens)
      </text>
    </svg>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────

const BADGE: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  B: 'bg-amber-100 text-amber-700 border-amber-200',
  C: 'bg-rose-100 text-rose-700 border-rose-200',
}

const ROW_BG: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-emerald-50/40',
  B: 'bg-amber-50/40',
  C: 'bg-rose-50/20',
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CurvaAbcView({
  abcServicos,
  abcInsumos,
  orcamentoNome,
}: {
  abcServicos: AbcItem[]
  abcInsumos: AbcItem[]
  orcamentoNome?: string
}) {
  const [tab, setTab] = useState<'servicos' | 'insumos'>('servicos')
  const [filtro, setFiltro] = useState<'todos' | 'A' | 'B' | 'C'>('todos')
  const [exportandoPdf, setExportandoPdf] = useState(false)

  const items = tab === 'servicos' ? abcServicos : abcInsumos
  const filtered = filtro === 'todos' ? items : items.filter(i => i.classe === filtro)

  const total = items.reduce((s, i) => s + i.valor_total, 0)
  const byClass = (c: 'A' | 'B' | 'C') => items.filter(i => i.classe === c)

  async function handleExportXlsx() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'FS Orçamento'
    const sheetName = tab === 'servicos' ? 'ABC Serviços' : 'ABC Insumos'
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
    a.href = url; a.download = `curva_abc_${tab}_${new Date().toISOString().split('T')[0]}.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleExportPdf() {
    setExportandoPdf(true)
    try {
      await exportCurvaAbcPdf(items, tab, orcamentoNome)
    } finally {
      setExportandoPdf(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* Tabs composições / insumos */}
      <div className="flex gap-0 border-b border-gray-200">
        {([
          { key: 'servicos', label: 'Serviços', count: abcServicos.length },
          { key: 'insumos', label: 'Insumos', count: abcInsumos.length },
        ] as const).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setFiltro('todos') }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
            <span className="ml-1.5 text-xs text-gray-400">({count})</span>
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
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
            <div key={c} className={`rounded-lg border ${colors.border} ${colors.bg} p-4 shadow-sm`}>
              <p className={`text-xs font-medium uppercase tracking-wide ${colors.title}`}>
                Classe {c} <span className="font-normal">({threshold})</span>
              </p>
              <p className={`text-xl font-bold mt-1 tabular-nums ${colors.val}`}>{fmt(sum)}</p>
              <p className={`text-xs mt-0.5 ${colors.sub}`}>{cls.length} itens · {pct}% do total</p>
            </div>
          )
        })}
      </div>

      {/* Chart */}
      {items.length > 0 ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Curva ABC Acumulada</p>
          <AbcChart items={items} />
          <div className="flex gap-4 mt-2 justify-center">
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="inline-block w-6 h-0.5 bg-blue-600 rounded" />
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
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <p className="text-sm font-medium text-gray-500">Nenhum dado disponível</p>
          <p className="text-xs text-gray-400 mt-1">Importe itens na aba <strong>Planilha</strong> para gerar a Curva ABC.</p>
        </div>
      )}

      {/* Controles da tabela */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1">
          {([
            { v: 'todos', label: 'Todos' },
            { v: 'A', label: 'Classe A' },
            { v: 'B', label: 'Classe B' },
            { v: 'C', label: 'Classe C' },
          ] as const).map(({ v, label }) => {
            const active = filtro === v
            const activeClass =
              v === 'todos' ? 'bg-gray-800 text-white border-gray-800' :
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
          <button
            onClick={handleExportXlsx}
            disabled={items.length === 0}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Exportar XLSX
          </button>
          <button
            onClick={handleExportPdf}
            disabled={items.length === 0 || exportandoPdf}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {exportandoPdf ? 'Gerando PDF…' : 'Exportar PDF'}
          </button>
          <button
            onClick={() => window.print()}
            disabled={items.length === 0}
            className="flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir / PDF
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-white shadow-sm overflow-x-auto print:shadow-none print:border-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-3 py-2.5 text-right font-medium text-gray-500 w-10">#</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-500 w-28">Código</th>
              <th className="px-3 py-2.5 text-left font-medium text-gray-500">Descrição</th>
              <th className="px-3 py-2.5 text-center font-medium text-gray-500 w-14">Und</th>
              <th className="px-3 py-2.5 text-right font-medium text-gray-500 w-28">Quantidade</th>
              <th className="px-3 py-2.5 text-right font-medium text-gray-500 w-32">Custo Unit.</th>
              <th className="px-3 py-2.5 text-right font-medium text-gray-500 w-32">Valor Total</th>
              <th className="px-3 py-2.5 text-right font-medium text-gray-500 w-16">%</th>
              <th className="px-3 py-2.5 text-right font-medium text-gray-500 w-20">% Acum.</th>
              <th className="px-3 py-2.5 text-center font-medium text-gray-500 w-16">Classe</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map(item => {
              const rank = items.indexOf(item) + 1
              return (
                <tr key={rank} className={ROW_BG[item.classe]}>
                  <td className="px-3 py-1.5 text-right font-mono text-xs text-gray-400 tabular-nums">{rank}</td>
                  <td className="px-3 py-1.5 font-mono text-xs text-gray-600">{item.codigo ?? '—'}</td>
                  <td className="px-3 py-1.5 text-gray-900">{item.descricao}</td>
                  <td className="px-3 py-1.5 text-center text-xs text-gray-500">{item.unidade ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{fmtQtd(item.quantidade)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">{fmt(item.custo_unitario)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-gray-900">{fmt(item.valor_total)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{fmtPct(item.percentual)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{fmtPct(item.percentual_acumulado)}</td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border ${BADGE[item.classe]}`}>
                      {item.classe}
                    </span>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">
                  {items.length === 0
                    ? 'Nenhum dado. Importe itens na planilha primeiro.'
                    : 'Nenhum item nessa classe.'}
                </td>
              </tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="border-t bg-gray-50">
              <tr>
                <td colSpan={6} className="px-3 py-2 text-right text-xs text-gray-500">
                  {filtered.length} item(ns)
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900 text-sm">
                  {fmt(filtered.reduce((s, i) => s + i.valor_total, 0))}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
