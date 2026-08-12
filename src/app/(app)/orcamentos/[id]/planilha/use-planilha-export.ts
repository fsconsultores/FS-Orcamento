'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatDateOnly } from '@/lib/format-date'
import type { EstruturaItem } from './planilha-crud-action'
import type { Nodo } from './planilha-tree'

/**
 * Insumo mostrado na sub-linha do modo Analítica. `id`/`estimado`/
 * `estimadoMotivo` só existem pra origem 'orcamento' (linha real em
 * orcamento_insumos) — origem 'base' vem da base global (fallback quando o
 * item não tem composição própria neste orçamento) e não tem uma linha
 * própria pra marcar como estimada.
 */
export interface AnaliticaInsumoRow {
  id: string | null
  codigo: string
  descricao: string
  unidade: string | null
  custo: number
  indice: number
  origem: 'orcamento' | 'base'
  estimado: boolean
  estimadoMotivo: string | null
}

// Remove caracteres inválidos em XML 1.0 (causa de corrupção no Excel)
function sanitize(v: unknown): string {
  if (v == null) return ''
  return String(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
}

export function usePlanilhaExport({
  orcamentoId, nomeOrcamento, cliente, dataOrcamento, items, flat, grandTotal,
}: {
  orcamentoId: string
  nomeOrcamento?: string
  cliente?: string | null
  dataOrcamento?: string | null
  items: EstruturaItem[]
  flat: { nodo: Nodo; depth: number }[]
  grandTotal: number
}) {
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportAnaliticaLoading, setExportAnaliticaLoading] = useState(false)
  const [exportAnaliticaError, setExportAnaliticaError] = useState<string | null>(null)
  const [analiticaInsumos, setAnaliticaInsumos] = useState<Map<string, AnaliticaInsumoRow[]>>(new Map())
  const [analiticaLoading, setAnaliticaLoading] = useState(false)
  const [analiticaError, setAnaliticaError] = useState<string | null>(null)

  async function addSheetHeader(wb: any, ws: any, titulo: string) {
    const hFill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
    const hBdr  = (style: 'thin' | 'medium', argb: string) => ({ style, color: { argb } })
    const dataStr = dataOrcamento ? formatDateOnly(dataOrcamento) : formatDate(new Date())

    const r1 = ws.addRow([]); r1.height = 32
    const r2 = ws.addRow([]); r2.height = 22
    const r3 = ws.addRow([]); r3.height = 5

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

    const outerBdr = { top: hBdr('medium', 'FF334155'), bottom: hBdr('medium', 'FF334155'), left: hBdr('medium', 'FF334155'), right: hBdr('medium', 'FF334155') }

    const logoCell = ws.getCell('A1')
    logoCell.fill = hFill('FFFFFFFF')
    logoCell.border = { ...outerBdr, bottom: hBdr('thin', 'FFE2E8F0'), right: hBdr('thin', 'FFE2E8F0') }

    const infoCell = ws.getCell('A2')
    infoCell.value = `Cliente: ${cliente ?? '—'}     Obra: ${nomeOrcamento ?? '—'}`
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

  async function handleExport() {
    setExportError(null)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'FS Orçamento'
      const ws = wb.addWorksheet('Planilha')

      const C = {
        slate800: 'FF1E293B', slate700: 'FF334155', slate50:  'FFF8FAFC',
        blue50:   'FFEFF6FF', blue950:  'FF172554',
        white:    'FFFFFFFF', gray700:  'FF374151',
        headerBg: 'FFF1F5F9', headerFg: 'FF64748B',
        border:   'FFE2E8F0', borderDk: 'FF475569',
      }
      const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
      const bdr  = (style: 'thin' | 'medium', argb: string) => ({ style, color: { argb } })

      ws.columns = [
        { width: 10 }, { width: 13 }, { width: 52 },
        { width:  6 }, { width: 12 }, { width: 15 }, { width: 16 },
      ]

      await addSheetHeader(wb, ws, 'PLANILHA DE ORÇAMENTO')

      // Cabeçalho de colunas
      const hRow = ws.addRow(['Item', 'Código', 'Descrição', 'Und', 'Qtde', 'R$ Unit.', 'R$ Total'])
      hRow.height = 20
      hRow.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.fill = fill(C.headerBg)
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.headerFg } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('medium', C.borderDk), bottom: bdr('medium', C.borderDk), left: bdr('thin', C.border), right: bdr('thin', C.border) }
      })

      // Linhas de dados — usar '' em vez de null garante que todas as 7 células
      // existam na linha, permitindo que eachCell itere corretamente até a col 7
      for (const { nodo, depth } of flat) {
        const isItem = nodo.tipo === 'item'
        const total  = isItem ? (nodo.quantidade ?? 0) * (nodo.custo_unitario ?? 0) : nodo.total
        const row = ws.addRow([
          sanitize(nodo.numero)  || '',
          sanitize(nodo.codigo)  || '',
          sanitize('  '.repeat(depth) + nodo.descricao) || '',
          sanitize(nodo.unidade) || '',
          isItem && nodo.quantidade     != null ? nodo.quantidade     : '',
          isItem && nodo.custo_unitario != null ? nodo.custo_unitario : '',
          total > 0 ? total : '',
        ])

        let bg: string, fg: string, bold: boolean, sz: number, ht: number
        if      (depth === 0) { bg = C.slate800; fg = C.white;   bold = true;  sz = 10; ht = 18 }
        else if (depth === 1) { bg = C.blue50;   fg = C.blue950; bold = true;  sz = 9;  ht = 15 }
        else if (depth === 2) { bg = C.slate50;  fg = C.gray700; bold = false; sz = 9;  ht = 15 }
        else                  { bg = C.white;    fg = C.gray700; bold = false; sz = 9;  ht = 15 }

        row.height = ht
        const dk = depth <= 0
        row.eachCell({ includeEmpty: true }, (cell, c) => {
          cell.fill = fill(bg)
          cell.font = { name: 'Calibri', size: sz, bold, color: { argb: fg } }
          cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
          cell.border = { top: bdr('thin', dk ? C.borderDk : C.border), bottom: bdr('thin', dk ? C.borderDk : C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
          if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
        })
      }

      // Total geral
      const tRow = ws.addRow(['', '', 'TOTAL GERAL', '', '', '', grandTotal])
      tRow.height = 20
      tRow.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.fill = fill(C.slate800)
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: c === 3 ? C.headerFg : C.white } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : c === 3 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('medium', C.slate700), bottom: bdr('thin', C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
        if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
      })

      const slug = (nomeOrcamento ?? 'planilha').replace(/[/\\?%*:|"<>]/g, '-').trim()
      const buf  = await wb.xlsx.writeBuffer()
      const url  = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a    = document.createElement('a')
      a.href = url; a.download = `${slug}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Erro ao gerar o arquivo Excel.')
    }
  }

  async function fetchInsumosByCodigo(): Promise<Map<string, AnaliticaInsumoRow[]>> {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 30_000)

    // Orçamentos com muitas composições (visto em produção: 647) geram um
    // `.in('composicao_id', [...])` com centenas de UUIDs na querystring —
    // a API rejeita com HTTP 400 (URL grande demais) e, sem isso, o erro
    // ficava só no console: a Analítica renderizava vazia sem avisar nada
    // (bug real: "importo a planilha mas ela não aparece analítica").
    // Divide em lotes e junta os resultados, mesmo princípio de paginação já
    // usado em outras buscas grandes deste app.
    const BATCH = 150
    async function emLotes<T>(ids: string[], montar: (lote: string[]) => any): Promise<T[]> {
      if (ids.length === 0) return []
      const lotes: string[][] = []
      for (let i = 0; i < ids.length; i += BATCH) lotes.push(ids.slice(i, i + BATCH))
      const respostas = await Promise.all(lotes.map(lote => montar(lote)))
      const out: T[] = []
      for (const { data, error } of respostas) {
        if (error) throw ac.signal.aborted ? new Error('Tempo limite excedido. Verifique sua conexão.') : error
        out.push(...((data ?? []) as T[]))
      }
      return out
    }

    try {
      const sb = createClient() as any
      const { data: composicoes, error: compError } = await sb
        .from('orcamento_composicoes')
        .select('id, codigo')
        .eq('orcamento_id', orcamentoId)
        .abortSignal(ac.signal)
      if (compError) throw ac.signal.aborted ? new Error('Tempo limite excedido. Verifique sua conexão.') : compError
      const idToCodigo = new Map<string, string>()
      for (const c of composicoes ?? []) idToCodigo.set(c.id, c.codigo)
      const compIds = (composicoes ?? []).map((c: any) => c.id)
      const result = new Map<string, AnaliticaInsumoRow[]>()
      if (compIds.length > 0) {
        const insumos = await emLotes<{ id: string; composicao_id: string; codigo: string | null; descricao: string | null; unidade: string | null; custo: number | null; indice: number | null; estimado: boolean | null; estimado_motivo: string | null }>(
          compIds,
          lote => sb.from('orcamento_insumos')
            .select('id, composicao_id, codigo, descricao, unidade, custo, indice, estimado, estimado_motivo')
            .in('composicao_id', lote)
            .abortSignal(ac.signal)
        )

        // Preço avulso (canônico, composicao_id IS NULL) tem prioridade sobre o
        // custo gravado na cópia dentro da composição — mesma regra do motor de
        // cálculo e da tela de detalhe da composição. Sem isso, um insumo cuja
        // cópia nunca foi sincronizada aparece zerado mesmo com preço cadastrado.
        const codigosUnicos = [...new Set(insumos.map(i => i.codigo).filter((c): c is string => !!c))]
        const avulsoPrecoMap = new Map<string, number>()
        if (codigosUnicos.length > 0) {
          const avulsos = await emLotes<{ codigo: string; custo: number }>(
            codigosUnicos,
            lote => sb.from('orcamento_insumos')
              .select('codigo, custo')
              .eq('orcamento_id', orcamentoId)
              .is('composicao_id', null)
              .in('codigo', lote)
              .abortSignal(ac.signal)
          )
          for (const av of avulsos) {
            if (av.custo) avulsoPrecoMap.set(av.codigo, av.custo)
          }
        }

        for (const ins of insumos) {
          const cod = idToCodigo.get(ins.composicao_id)
          if (!cod) continue
          if (!result.has(cod)) result.set(cod, [])
          result.get(cod)!.push({
            id: ins.id,
            codigo: ins.codigo ?? '', descricao: ins.descricao ?? '', unidade: ins.unidade,
            custo: avulsoPrecoMap.get(ins.codigo ?? '') ?? ins.custo ?? 0,
            indice: ins.indice ?? 0, origem: 'orcamento',
            estimado: ins.estimado ?? false, estimadoMotivo: ins.estimado_motivo,
          })
        }
      }

      // Fallback: itens importados em modo sintética não possuem composição
      // própria no orçamento — busca a composição analítica na base global.
      const codigosFaltantes = [...new Set(
        items
          .filter(i => i.tipo === 'item' && i.codigo && !result.has(i.codigo))
          .map(i => i.codigo as string)
      )]
      if (codigosFaltantes.length > 0) {
        const composicoesBase = await emLotes<{ id: string; codigo: string }>(
          codigosFaltantes,
          lote => sb.from('tabela_composicoes').select('id, codigo').in('codigo', lote).abortSignal(ac.signal)
        )
        const idToCodigoBase = new Map<string, string>()
        for (const c of composicoesBase) idToCodigoBase.set(c.id, c.codigo)
        const compIdsBase = composicoesBase.map(c => c.id)
        if (compIdsBase.length > 0) {
          const itensBase = await emLotes<{ composicao_id: string; indice: number | null; tabela_insumos: { codigo: string | null; descricao: string | null; unidade: string | null; preco_base: number | null } | null }>(
            compIdsBase,
            lote => sb.from('tabela_itens_composicao')
              .select('composicao_id, indice, tabela_insumos(codigo, descricao, unidade, preco_base)')
              .in('composicao_id', lote)
              .abortSignal(ac.signal)
          )
          for (const it of itensBase) {
            const cod = idToCodigoBase.get(it.composicao_id)
            const insumo = it.tabela_insumos
            if (!cod || !insumo) continue
            if (!result.has(cod)) result.set(cod, [])
            result.get(cod)!.push({
              id: null,
              codigo: insumo.codigo ?? '',
              descricao: insumo.descricao ?? '',
              unidade: insumo.unidade ?? null,
              custo: insumo.preco_base ?? 0,
              indice: it.indice ?? 0,
              origem: 'base',
              estimado: false,
              estimadoMotivo: null,
            })
          }
        }
      }

      return result
    } finally {
      clearTimeout(timer)
    }
  }

  async function handleExportAnalitica() {
    setExportAnaliticaError(null)
    setExportAnaliticaLoading(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const insumoData = analiticaInsumos.size > 0
        ? analiticaInsumos
        : await fetchInsumosByCodigo()

      const wb = new ExcelJS.Workbook()
      wb.creator = 'FS Orçamento'
      const ws = wb.addWorksheet('Planilha Analítica')

      const C = {
        slate800: 'FF1E293B', slate700: 'FF334155', slate50:  'FFF8FAFC',
        blue50:   'FFEFF6FF', blue950:  'FF172554',
        white:    'FFFFFFFF', gray700:  'FF374151',
        headerBg: 'FFF1F5F9', headerFg: 'FF64748B',
        border:   'FFE2E8F0', borderDk: 'FF475569',
        insumoFg: 'FF4B5563', insumoBdr: 'FFF0F4F8',
      }
      const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
      const bdr  = (style: 'thin' | 'medium', argb: string) => ({ style, color: { argb } })

      ws.columns = [
        { width: 10 }, { width: 13 }, { width: 55 },
        { width:  6 }, { width: 12 }, { width: 15 }, { width: 16 },
      ]

      await addSheetHeader(wb, ws, 'PLANILHA ANALÍTICA DE PREÇOS UNITÁRIOS')

      // Cabeçalho de colunas
      const hRow = ws.addRow(['Item', 'Código', 'Descrição', 'Und', 'Qtde', 'R$ Unit.', 'R$ Total'])
      hRow.height = 20
      hRow.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.fill = fill(C.headerBg)
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: C.headerFg } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('medium', C.borderDk), bottom: bdr('medium', C.borderDk), left: bdr('thin', C.border), right: bdr('thin', C.border) }
      })

      // Usar '' em vez de null garante que eachCell itere todas as 7 colunas
      for (const { nodo, depth } of flat) {
        const isItem = nodo.tipo === 'item'
        const total  = isItem ? (nodo.quantidade ?? 0) * (nodo.custo_unitario ?? 0) : nodo.total

        const row = ws.addRow([
          sanitize(nodo.numero)  || '',
          sanitize(nodo.codigo)  || '',
          sanitize('  '.repeat(depth) + nodo.descricao) || '',
          sanitize(nodo.unidade) || '',
          isItem && nodo.quantidade     != null ? nodo.quantidade     : '',
          isItem && nodo.custo_unitario != null ? nodo.custo_unitario : '',
          total > 0 ? total : '',
        ])

        let bg: string, fg: string, bold: boolean, sz: number, ht: number
        if (isItem)           { bg = C.slate50;  fg = C.gray700; bold = false; sz = 9;  ht = 15 }
        else if (depth === 0) { bg = C.slate800; fg = C.white;   bold = true;  sz = 10; ht = 18 }
        else if (depth === 1) { bg = C.blue50;   fg = C.blue950; bold = true;  sz = 9;  ht = 15 }
        else                  { bg = C.slate50;  fg = C.gray700; bold = true;  sz = 9;  ht = 15 }

        row.height = ht
        const dk = !isItem && depth === 0
        row.eachCell({ includeEmpty: true }, (cell, c) => {
          cell.fill = fill(bg)
          cell.font = { name: 'Calibri', size: sz, bold, color: { argb: fg } }
          cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
          cell.border = { top: bdr('thin', dk ? C.borderDk : C.border), bottom: bdr('thin', dk ? C.borderDk : C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
          if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
        })

        // Linhas de insumos
        if (isItem && nodo.codigo) {
          const insumosForComp = insumoData.get(nodo.codigo) ?? []
          for (const ins of insumosForComp) {
            const custoTotal = (ins.indice ?? 0) * (ins.custo ?? 0)
            const iRow = ws.addRow([
              '',
              sanitize(ins.codigo) || '',
              sanitize('    ' + ins.descricao) || '',
              sanitize(ins.unidade ?? '') || '',
              ins.indice ?? '',
              ins.custo  ?? '',
              custoTotal > 0 ? custoTotal : '',
            ])
            iRow.height = 13
            iRow.eachCell({ includeEmpty: true }, (cell, c) => {
              cell.fill = fill(C.white)
              cell.font = { name: 'Calibri', size: 8, bold: false, color: { argb: C.insumoFg } }
              cell.alignment = { horizontal: c >= 5 ? 'right' : 'left', vertical: 'middle', wrapText: c === 3 }
              cell.border = { top: bdr('thin', C.insumoBdr), bottom: bdr('thin', C.insumoBdr), left: bdr('thin', C.border), right: bdr('thin', C.border) }
              if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
              if (c === 5 && typeof cell.value === 'number')              cell.numFmt = '#,##0.0000'
            })
          }
        }
      }

      // Total geral
      const tRow = ws.addRow(['', '', 'TOTAL GERAL', '', '', '', grandTotal])
      tRow.height = 20
      tRow.eachCell({ includeEmpty: true }, (cell, c) => {
        cell.fill = fill(C.slate800)
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: c === 3 ? C.headerFg : C.white } }
        cell.alignment = { horizontal: c >= 5 ? 'right' : c === 3 ? 'right' : 'left', vertical: 'middle' }
        cell.border = { top: bdr('medium', C.slate700), bottom: bdr('thin', C.border), left: bdr('thin', C.border), right: bdr('thin', C.border) }
        if ((c === 6 || c === 7) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
      })

      const slug = (nomeOrcamento ?? 'planilha').replace(/[/\\?%*:|"<>]/g, '-').trim()
      const buf  = await wb.xlsx.writeBuffer()
      const url  = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const a    = document.createElement('a')
      a.href = url; a.download = `${slug}_analitica.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportAnaliticaError(err instanceof Error ? err.message : 'Erro ao gerar o arquivo Excel.')
    } finally {
      setExportAnaliticaLoading(false)
    }
  }

  async function loadAnaliticaData() {
    if (analiticaInsumos.size > 0) return
    setAnaliticaLoading(true)
    setAnaliticaError(null)
    try {
      const data = await fetchInsumosByCodigo()
      setAnaliticaInsumos(data)
    } catch (e) {
      // Nunca mais silencioso: sem isso, uma falha de rede/API vira "Analítica
      // sem nenhum insumo" sem explicação nenhuma pro usuário (bug real que já
      // aconteceu — ver fetchInsumosByCodigo).
      setAnaliticaError(e instanceof Error ? e.message : 'Não foi possível carregar os insumos da Analítica.')
    } finally {
      setAnaliticaLoading(false)
    }
  }

  return {
    exportError,
    handleExport,
    exportAnaliticaLoading,
    exportAnaliticaError,
    handleExportAnalitica,
    analiticaInsumos,
    setAnaliticaInsumos,
    analiticaLoading,
    analiticaError,
    setAnaliticaError,
    loadAnaliticaData,
  }
}
