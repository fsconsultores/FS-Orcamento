'use client'

import { useState } from 'react'
import type { CadernoData, CadernoNode } from '@/lib/orcamento/caderno'
import type { AbcItem } from '@/lib/curva-abc'

type LoadingKey =
  | 'caderno-pdf'
  | 'planilha-xlsx'
  | 'analitica-xlsx'
  | 'abc-servicos-pdf'
  | 'abc-servicos-xlsx'
  | 'abc-insumos-pdf'
  | 'abc-insumos-xlsx'

function flattenArvore(nodes: CadernoNode[], depth = 0): { node: CadernoNode; depth: number }[] {
  const out: { node: CadernoNode; depth: number }[] = []
  for (const n of nodes) {
    out.push({ node: n, depth })
    if (n.filhos.length > 0) out.push(...flattenArvore(n.filhos, depth + 1))
  }
  return out
}

function sanitize(v: string | null | undefined): string {
  return (v ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

async function addSheetHeader(wb: any, ws: any, titulo: string, orcamento: CadernoData['orcamento']) {
  const hFill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
  const hBdr  = (style: 'thin' | 'medium', argb: string) => ({ style, color: { argb } })
  const dataStr = orcamento.data
    ? new Date(orcamento.data + 'T00:00:00').toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR')

  const r1 = ws.addRow([]); r1.height = 32
  const r2 = ws.addRow([]); r2.height = 22
  ws.addRow([]).height = 5

  ws.mergeCells('A1:B1')
  ws.mergeCells('A2:B2')
  ws.mergeCells('C1:E2')
  ws.mergeCells('F1:G1')
  ws.mergeCells('F2:G2')

  try {
    const resp = await fetch('/logofs.png')
    if (resp.ok) {
      const buf = await resp.arrayBuffer()
      const imgId = wb.addImage({ buffer: buf, extension: 'png' })
      ws.addImage(imgId, { tl: { col: 0, row: 0 }, ext: { width: 130, height: 32 } })
    }
  } catch { /* logo opcional */ }

  const outerBdr = {
    top: hBdr('medium', 'FF334155'), bottom: hBdr('medium', 'FF334155'),
    left: hBdr('medium', 'FF334155'), right: hBdr('medium', 'FF334155'),
  }

  const logoCell = ws.getCell('A1')
  logoCell.fill = hFill('FFFFFFFF')
  logoCell.border = { ...outerBdr, bottom: hBdr('thin', 'FFE2E8F0'), right: hBdr('thin', 'FFE2E8F0') }

  const infoCell = ws.getCell('A2')
  infoCell.value = `Cliente: ${orcamento.cliente ?? '—'}     Obra: ${orcamento.nome_obra ?? '—'}`
  infoCell.font = { name: 'Calibri', size: 8, color: { argb: 'FF374151' } }
  infoCell.alignment = { vertical: 'middle', horizontal: 'left' }
  infoCell.fill = hFill('FFF8FAFC')
  infoCell.border = { ...outerBdr, top: hBdr('thin', 'FFE2E8F0'), right: hBdr('thin', 'FFE2E8F0') }

  const titleCell = ws.getCell('C1')
  titleCell.value = titulo
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = hFill('FF1E293B')
  titleCell.border = { ...outerBdr, left: hBdr('thin', 'FF334155'), right: hBdr('thin', 'FF334155') }

  const revCell = ws.getCell('F1')
  revCell.value = 'REV 00'
  revCell.font = { name: 'Calibri', size: 8, bold: true, color: { argb: 'FF374151' } }
  revCell.alignment = { horizontal: 'right', vertical: 'middle' }
  revCell.fill = hFill('FFF8FAFC')
  revCell.border = { ...outerBdr, left: hBdr('thin', 'FFE2E8F0'), bottom: hBdr('thin', 'FFE2E8F0') }

  const dateCell = ws.getCell('F2')
  dateCell.value = `Data: ${dataStr}`
  dateCell.font = { name: 'Calibri', size: 8, color: { argb: 'FF374151' } }
  dateCell.alignment = { horizontal: 'right', vertical: 'middle' }
  dateCell.fill = hFill('FFF8FAFC')
  dateCell.border = { ...outerBdr, left: hBdr('thin', 'FFE2E8F0'), top: hBdr('thin', 'FFE2E8F0') }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RelatoriosView({ data }: { data: CadernoData }) {
  const [loading, setLoading] = useState<Set<LoadingKey>>(new Set())
  const [errors, setErrors]   = useState<Partial<Record<LoadingKey, string>>>({})

  function start(key: LoadingKey) {
    setLoading(prev => new Set(prev).add(key))
    setErrors(prev => { const n = { ...prev }; delete n[key]; return n })
  }
  function stop(key: LoadingKey) {
    setLoading(prev => { const n = new Set(prev); n.delete(key); return n })
  }
  function setErr(key: LoadingKey, msg: string) {
    setErrors(prev => ({ ...prev, [key]: msg }))
    stop(key)
  }
  const busy = (key: LoadingKey) => loading.has(key)

  // ─── Handlers ──────────────────────────────────────────────────────────────

  async function handleCadernoPdf() {
    start('caderno-pdf')
    try {
      const { exportCadernoPdf } = await import('../caderno/export-caderno-pdf')
      await exportCadernoPdf(data)
    } catch (e) {
      setErr('caderno-pdf', e instanceof Error ? e.message : 'Erro ao gerar PDF')
    } finally {
      stop('caderno-pdf')
    }
  }

  async function handlePlanilhaXlsx() {
    start('planilha-xlsx')
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'FS Orçamento'
      const ws = wb.addWorksheet('Planilha')

      const C = {
        slate800: 'FF1E293B', slate700: 'FF334155', slate50: 'FFF8FAFC',
        blue50: 'FFEFF6FF', blue950: 'FF172554',
        white: 'FFFFFFFF', gray700: 'FF374151',
        headerBg: 'FFF1F5F9', headerFg: 'FF64748B',
        border: 'FFE2E8F0', borderDk: 'FF475569',
      }
      const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
      const bdr  = (style: 'thin' | 'medium', argb: string) => ({ style, color: { argb } })

      ws.columns = [
        { width: 10 }, { width: 13 }, { width: 52 },
        { width: 6 },  { width: 12 }, { width: 15 }, { width: 16 },
      ]

      await addSheetHeader(wb, ws, 'PLANILHA DE ORÇAMENTO', data.orcamento)

      const hRow = ws.addRow(['Item', 'Código', 'Descrição', 'Und', 'Qtde', 'R$ Unit.', 'R$ Total'])
      hRow.height = 20
      hRow.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
        cell.fill = fill(C.headerBg)
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.headerFg } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('medium', C.borderDk), bottom: bdr('medium', C.borderDk), left: bdr('thin', C.border), right: bdr('thin', C.border) }
      })

      for (const { node, depth } of flattenArvore(data.arvore)) {
        const isItem = node.tipo === 'item'
        const row = ws.addRow([
          sanitize(node.numero)  || '',
          sanitize(node.codigo)  || '',
          sanitize('  '.repeat(depth) + node.descricao) || '',
          sanitize(node.unidade) || '',
          isItem && node.quantidade    != null ? node.quantidade    : '',
          isItem && node.custoUnitario  > 0    ? node.custoUnitario : '',
          node.total > 0 ? node.total : '',
        ])

        let bg: string, fg: string, bold: boolean, sz: number, ht: number
        if      (depth === 0) { bg = C.slate800; fg = C.white;   bold = true;  sz = 10; ht = 18 }
        else if (depth === 1) { bg = C.blue50;   fg = C.blue950; bold = true;  sz = 9;  ht = 15 }
        else if (depth === 2) { bg = C.slate50;  fg = C.gray700; bold = false; sz = 9;  ht = 15 }
        else                  { bg = C.white;    fg = C.gray700; bold = false; sz = 9;  ht = 15 }

        row.height = ht
        const dk = depth === 0
        row.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
          cell.fill = fill(bg)
          cell.font = { name: 'Calibri', size: sz, bold, color: { argb: fg } }
          cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
          cell.border = { top: bdr('thin', dk ? C.borderDk : C.border), bottom: bdr('thin', dk ? C.borderDk : C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
          if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
        })
      }

      const tRow = ws.addRow(['', '', 'TOTAL GERAL', '', '', '', data.totalGeral])
      tRow.height = 20
      tRow.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
        cell.fill = fill(C.slate800)
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: c === 3 ? C.headerFg : C.white } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : c === 3 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('medium', C.slate700), bottom: bdr('thin', C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
        if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
      })

      const slug = (data.orcamento.nome_obra ?? 'planilha').replace(/[/\\?%*:|"<>]/g, '-').trim()
      const buf  = await wb.xlsx.writeBuffer()
      const url  = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a    = document.createElement('a')
      a.href = url; a.download = `${slug}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr('planilha-xlsx', e instanceof Error ? e.message : 'Erro ao gerar Excel')
    } finally {
      stop('planilha-xlsx')
    }
  }

  async function handleAnaliticaXlsx() {
    start('analitica-xlsx')
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'FS Orçamento'
      const ws = wb.addWorksheet('Planilha Analítica')

      const C = {
        slate800: 'FF1E293B', slate700: 'FF334155', slate50: 'FFF8FAFC',
        blue50: 'FFEFF6FF', blue950: 'FF172554',
        white: 'FFFFFFFF', gray700: 'FF374151',
        headerBg: 'FFF1F5F9', headerFg: 'FF64748B',
        border: 'FFE2E8F0', borderDk: 'FF475569',
        insumoFg: 'FF4B5563', insumoBdr: 'FFF0F4F8',
      }
      const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
      const bdr  = (style: 'thin' | 'medium', argb: string) => ({ style, color: { argb } })

      ws.columns = [
        { width: 10 }, { width: 13 }, { width: 55 },
        { width: 6 },  { width: 12 }, { width: 15 }, { width: 16 },
      ]

      await addSheetHeader(wb, ws, 'PLANILHA ANALÍTICA DE PREÇOS UNITÁRIOS', data.orcamento)

      const hRow = ws.addRow(['Item', 'Código', 'Descrição', 'Und', 'Qtde', 'R$ Unit.', 'R$ Total'])
      hRow.height = 20
      hRow.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
        cell.fill = fill(C.headerBg)
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.headerFg } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('medium', C.borderDk), bottom: bdr('medium', C.borderDk), left: bdr('thin', C.border), right: bdr('thin', C.border) }
      })

      for (const row of data.planilhaAnalitica) {
        if (row.tipo === 'grupo') {
          const r = ws.addRow([row.numero, '', sanitize(row.descricao) || '', '', '', '', ''])
          r.height = 18
          r.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
            cell.fill = fill(C.slate800)
            cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: C.white } }
            cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle' }
            cell.border = { top: bdr('thin', C.borderDk), bottom: bdr('thin', C.borderDk), left: bdr('thin', C.border), right: bdr('thin', C.border) }
          })
        } else if (row.tipo === 'item') {
          const r = ws.addRow([
            row.numero,
            sanitize(row.codigo)   || '',
            sanitize(row.descricao) || '',
            sanitize(row.unidade)  || '',
            '',
            row.custoUnitario > 0 ? row.custoUnitario : '',
            row.custoTotal    > 0 ? row.custoTotal    : '',
          ])
          r.height = 15
          r.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
            cell.fill = fill(C.slate50)
            cell.font = { name: 'Calibri', size: 9, bold: false, color: { argb: C.gray700 } }
            cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
            cell.border = { top: bdr('thin', C.border), bottom: bdr('thin', C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
            if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
          })
        } else if (row.tipo === 'insumo') {
          const r = ws.addRow([
            '',
            sanitize(row.codigo)            || '',
            sanitize('    ' + row.descricao) || '',
            sanitize(row.unidade)           || '',
            row.indice   > 0 ? row.indice   : '',
            row.custoUnit > 0 ? row.custoUnit : '',
            row.custoTotal > 0 ? row.custoTotal : '',
          ])
          r.height = 13
          r.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
            cell.fill = fill(C.white)
            cell.font = { name: 'Calibri', size: 8, bold: false, color: { argb: C.insumoFg } }
            cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
            cell.border = { top: bdr('thin', C.insumoBdr), bottom: bdr('thin', C.insumoBdr), left: bdr('thin', C.border), right: bdr('thin', C.border) }
            if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
            if (c === 5 && typeof cell.value === 'number')              cell.numFmt = '#,##0.0000'
          })
        }
      }

      const tRow = ws.addRow(['', '', 'TOTAL GERAL', '', '', '', data.totalGeral])
      tRow.height = 20
      tRow.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
        cell.fill = fill(C.slate800)
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: c === 3 ? C.headerFg : C.white } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : c === 3 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('medium', C.slate700), bottom: bdr('thin', C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
        if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
      })

      const slug = (data.orcamento.nome_obra ?? 'planilha').replace(/[/\\?%*:|"<>]/g, '-').trim()
      const buf  = await wb.xlsx.writeBuffer()
      const url  = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a    = document.createElement('a')
      a.href = url; a.download = `${slug}_analitica.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErr('analitica-xlsx', e instanceof Error ? e.message : 'Erro ao gerar Excel')
    } finally {
      stop('analitica-xlsx')
    }
  }

  async function handleAbcPdf(tab: 'servicos' | 'insumos', key: LoadingKey) {
    start(key)
    try {
      const items = tab === 'servicos' ? data.abcServicos : data.abcInsumos
      const { exportCurvaAbcPdf } = await import('../curva-abc/export-pdf')
      await exportCurvaAbcPdf(items, tab, data.orcamento.nome_obra)
    } catch (e) {
      setErr(key, e instanceof Error ? e.message : 'Erro ao gerar PDF')
    } finally {
      stop(key)
    }
  }

  async function handleAbcXlsx(tab: 'servicos' | 'insumos', key: LoadingKey) {
    start(key)
    try {
      const items: AbcItem[] = tab === 'servicos' ? data.abcServicos : data.abcInsumos
      const total = items.reduce((s, i) => s + i.valor_total, 0)

      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'FS Orçamento'
      const ws = wb.addWorksheet(tab === 'servicos' ? 'ABC Serviços' : 'ABC Insumos')

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

      const hRow = ws.addRow(['#', 'Código', 'Descrição', 'Und', 'Quantidade', 'Custo Unit. (R$)', 'Valor Total (R$)', '% Individual', '% Acumulado', 'Classe'])
      hRow.height = 18
      hRow.eachCell({ includeEmpty: true }, (cell: any) => {
        cell.fill = fill(C.hBg)
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.hFg } }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = bdr()
      })

      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const bg   = item.classe === 'A' ? C.aBg : item.classe === 'B' ? C.bBg : C.cBg
        const row  = ws.addRow([
          i + 1, item.codigo ?? '', item.descricao,
          item.unidade ?? '', item.quantidade, item.custo_unitario,
          item.valor_total,
          +item.percentual.toFixed(4),
          +item.percentual_acumulado.toFixed(4),
          item.classe,
        ])
        row.height = 14
        row.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
          cell.fill = fill(bg)
          cell.font = { name: 'Calibri', size: 9, bold: c === 10, color: { argb: C.dark } }
          cell.alignment = { horizontal: c === 1 || c >= 5 ? 'right' : c === 4 || c === 10 ? 'center' : 'left', vertical: 'middle' }
          cell.border = bdr()
          if ((c === 5 || c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
          if ((c === 8 || c === 9) && typeof cell.value === 'number')            cell.numFmt = '#,##0.00##'
        })
      }

      const tRow = ws.addRow(['', '', `${items.length} itens`, '', '', 'TOTAL', total, '', '', ''])
      tRow.height = 16
      tRow.eachCell({ includeEmpty: true }, (cell: any, c: number) => {
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
    } catch (e) {
      setErr(key, e instanceof Error ? e.message : 'Erro ao gerar Excel')
    } finally {
      stop(key)
    }
  }

  // ─── UI Helpers ────────────────────────────────────────────────────────────

  function Spinner() {
    return (
      <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    )
  }

  function BtnPdf({ loadingKey, onClick }: { loadingKey: LoadingKey; onClick: () => void }) {
    const isbusy = busy(loadingKey)
    return (
      <button
        onClick={onClick}
        disabled={isbusy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
      >
        {isbusy ? <Spinner /> : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        )}
        PDF
      </button>
    )
  }

  function BtnXlsx({ loadingKey, onClick }: { loadingKey: LoadingKey; onClick: () => void }) {
    const isbusy = busy(loadingKey)
    return (
      <button
        onClick={onClick}
        disabled={isbusy}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
      >
        {isbusy ? <Spinner /> : (
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
        Excel
      </button>
    )
  }

  interface CardProps {
    icon: React.ReactNode
    title: string
    description: string
    meta?: string
    children: React.ReactNode
    errorKeys: LoadingKey[]
  }

  function Card({ icon, title, description, meta, children, errorKeys }: CardProps) {
    const err = errorKeys.map(k => errors[k]).find(Boolean)
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-5 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center text-slate-600">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="text-xs text-gray-500 mt-0.5">{description}</p>
            {meta && <p className="text-xs text-gray-400 mt-1">{meta}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {children}
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
      </div>
    )
  }

  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Relatórios</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {data.orcamento.nome_obra} — Total:{' '}
          <span className="font-medium text-gray-700">{fmt(data.totalGeral)}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Caderno */}
        <Card
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>}
          title="Caderno de Orçamento"
          description="Relatório completo: capa, planilha de preços, planilha analítica, curvas ABC, lista de insumos e mais."
          meta={`${data.arvore.length} grupos de nível 1`}
          errorKeys={['caderno-pdf']}
        >
          <BtnPdf loadingKey="caderno-pdf" onClick={handleCadernoPdf} />
        </Card>

        {/* Planilha sintética */}
        <Card
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
          title="Planilha de Orçamento"
          description="Visão sintética com todos os itens, quantidades e preços unitários."
          meta={`Total: ${fmt(data.totalGeral)}`}
          errorKeys={['planilha-xlsx']}
        >
          <BtnXlsx loadingKey="planilha-xlsx" onClick={handlePlanilhaXlsx} />
        </Card>

        {/* Planilha analítica */}
        <Card
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
          title="Planilha Analítica"
          description="Preços unitários detalhados com composição de insumos por serviço."
          meta={`${data.planilhaAnalitica.filter(r => r.tipo === 'item').length} itens com insumos`}
          errorKeys={['analitica-xlsx']}
        >
          <BtnXlsx loadingKey="analitica-xlsx" onClick={handleAnaliticaXlsx} />
        </Card>

        {/* Curva ABC Serviços */}
        <Card
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>}
          title="Curva ABC — Serviços"
          description="Classificação dos serviços por impacto no custo total (classes A, B e C)."
          meta={`${data.abcServicos.length} serviços`}
          errorKeys={['abc-servicos-pdf', 'abc-servicos-xlsx']}
        >
          <BtnPdf  loadingKey="abc-servicos-pdf"  onClick={() => handleAbcPdf('servicos', 'abc-servicos-pdf')} />
          <BtnXlsx loadingKey="abc-servicos-xlsx" onClick={() => handleAbcXlsx('servicos', 'abc-servicos-xlsx')} />
        </Card>

        {/* Curva ABC Insumos */}
        <Card
          icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
          title="Curva ABC — Insumos"
          description="Classificação dos insumos por impacto no custo total (classes A, B e C)."
          meta={`${data.abcInsumos.length} insumos`}
          errorKeys={['abc-insumos-pdf', 'abc-insumos-xlsx']}
        >
          <BtnPdf  loadingKey="abc-insumos-pdf"  onClick={() => handleAbcPdf('insumos', 'abc-insumos-pdf')} />
          <BtnXlsx loadingKey="abc-insumos-xlsx" onClick={() => handleAbcXlsx('insumos', 'abc-insumos-xlsx')} />
        </Card>

      </div>
    </div>
  )
}
