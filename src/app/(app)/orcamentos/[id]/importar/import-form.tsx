'use client'

import { useState, useRef, Fragment } from 'react'
import { importarInsumos, importarComposicoes, importarDaBase } from './import-action'
import type { ImportComposicaoRow, ImportInsumoRow, ImportResult, BaseInfo } from './import-action'
import { createClient } from '@/lib/supabase/client'
import { logAction } from '@/lib/log'

// ─── Helpers de parse ────────────────────────────────────────────────────────

const COL_ALIASES: Record<string, string[]> = {
  codigo:   ['cod', 'codigo', 'code',
             'codigodoinsumo', 'codigodoservico', 'codigodoitem',
             'codigodacomposicao', 'coddacomposicao', 'codcomposicao'],
  descricao:['descricao', 'descr', 'description', 'nome', 'name',
             'descricaoabreviada', 'descricaocomp', 'descricaocompleta',
             'descricaodoinsumo', 'descricaoabreviadainsumo', 'descricaoabreviadaitem',
             'descricaodoservico', 'descricaodoitem',
             'descricaodacomposicao', 'descricaocomposicao'],
  unidade:  ['unidade', 'und', 'un', 'unit', 'unidadedemedida', 'unid',
             'unidadedacomposicao', 'unidadedemedidadacomposicao'],
  custo:    ['custo', 'preco', 'price', 'valor', 'custounit', 'custounitario',
             'runit', 'mediana', 'medianadesonerado', 'medianadesonerada',
             'medianaonaodesonerado', 'mediananaodesonerdo',
             'precomediano', 'precomedianodesonerado', 'precomedianonaodesonerdo',
             'custounitariodesonerado', 'custounitarionaodesonerdo',
             'precototaldesonerado', 'precototal'],
  grupo:    ['grupo', 'grupois', 'grupoinsumo', 'grupodoinsumo', 'group', 'categoria', 'tipo'],
  base:     ['base', 'fonte', 'origem', 'cotacao', 'source'],
  data_ref: ['dataref', 'datareferencia', 'datadereferencia', 'ref'],
}

function parseNumber(val: unknown): number {
  if (typeof val === 'number') return val
  const s = String(val ?? '').replace(',', '.').replace(/[^\d.-]/g, '')
  return parseFloat(s) || 0
}

function normCol(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/[^a-z0-9]/g, '')
}

function detectCols(header: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  const normAliasCache: Record<string, string[]> = {}
  for (const [field, aliases] of Object.entries(COL_ALIASES)) {
    normAliasCache[field] = aliases.map(normCol)
  }
  header.forEach((h, i) => {
    const lower = normCol(h)
    for (const [field, normAliases] of Object.entries(normAliasCache)) {
      if (normAliases.includes(lower) && !(field in map)) map[field] = i
    }
  })
  return map
}

// Find the row with the most recognized column names (handles files with title rows before the header)
function findHeaderRow(data: unknown[][]): number {
  let bestRow = 0
  let bestScore = 0
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = (data[i] as unknown[]).map(String)
    const score = Object.keys(detectCols(row)).length
    if (score > bestScore) { bestScore = score; bestRow = i }
  }
  return bestRow
}

// Detecta se o arquivo está no formato SUDECAP/SINAPI:
// cabeçalho tem colunas "TipoItemComposicao" e "DescricaoAbreviadaInsumo"
function isSudecap(header: string[]): boolean {
  const joined = header.map(normCol).join('|')
  return joined.includes('tipoitem') || joined.includes('insumocomposicao')
    || joined.includes('origemcomposicao') || joined.includes('producaoequipe')
    || joined.includes('grupodoinsumo')
}

// ─── Parser SUDECAP/base própria ─────────────────────────────────────────────
// Detecta posições pelo cabeçalho; fallbacks para índices clássicos SUDECAP.
function parseSudecap(data: unknown[][], defaultBase?: string): { rows: ImportComposicaoRow[]; erros: string[] } {
  const rows: ImportComposicaoRow[] = []
  let current: ImportComposicaoRow | null = null

  if (data.length < 2) return { rows, erros: [] }

  // Detecta colunas pelo cabeçalho (linha 0)
  const hdr = (data[0] as unknown[]).map(c => normCol(String(c ?? '')))
  const col = (keys: string[], fallback: number) => {
    for (const k of keys) {
      const i = hdr.indexOf(k)
      if (i !== -1) return i
    }
    return fallback
  }

  const C = {
    codigoComp:  col(['codigo', 'codigodacomposicao', 'coddacomposicao'], 0),
    descComp:    col(['descricao', 'descricaodacomposicao', 'descricaoabreviada'], 1),
    unidadeComp: col(['unidade', 'unidadedacomposicao'], 2),
    tipoItem:    col(['tipoitem', 'tipoitemcomposicao'], 5),
    codigoIns:   col(['codigodoitem', 'codigodoinsumo', 'coditem', 'codigoitem'], 6),
    descIns:     col(['descricaodoinsumo', 'descricaoabreviadainsumo', 'descricaoabreviadaitem', 'descricaoitem'], 7),
    unidadeIns:  col(['unidadeitem', 'unidadedoinsumo', 'unidadeinsumo'], 8),
    indice:      col(['indice', 'coeficiente', 'coef', 'coefutil'], 9),
    grupo:       col(['grupodoinsumo', 'grupo', 'grupoinsumo'], 10),
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const codigoComp  = String(row[C.codigoComp]  ?? '').trim()
    const descComp    = String(row[C.descComp]    ?? '').trim()
    const unidadeComp = String(row[C.unidadeComp] ?? '').trim()
    const tipoItem    = String(row[C.tipoItem]    ?? '').trim().toUpperCase()
    const codigoIns   = String(row[C.codigoIns]   ?? '').trim()
    const descIns     = String(row[C.descIns]     ?? '').trim()
    const unidadeIns  = String(row[C.unidadeIns]  ?? '').trim()
    const indice      = parseFloat(String(row[C.indice] ?? '1').replace(',', '.')) || 1
    const grupo       = String(row[C.grupo]       ?? '').trim() || null

    if (!codigoComp && !descComp && !descIns) continue

    if (codigoComp && descComp) {
      current = { codigo: codigoComp, descricao: descComp, unidade: unidadeComp, base: defaultBase ?? null, insumos: [] }
      rows.push(current)
    }

    if ((tipoItem === 'I' || tipoItem === 'C') && descIns && current) {
      current.insumos.push({
        codigo: codigoIns,
        descricao: descIns,
        unidade: unidadeIns,
        custo: 0,
        indice,
        grupo,
        base: null,
        data_ref: null,
      })
    }
  }

  return { rows, erros: [] }
}

// ─── Parser simples (hierárquico) ────────────────────────────────────────────
// Linha com código = composição  |  linha sem código = insumo filho
function parseSimples(data: unknown[][], defaultBase?: string): { rows: ImportComposicaoRow[]; erros: string[] } {
  const erros: string[] = []
  const headerIdx = findHeaderRow(data)
  const header = (data[headerIdx] as unknown[]).map(String)
  const cols = detectCols(header)
  if (!('descricao' in cols)) {
    return { rows: [], erros: ['Coluna "descricao" não encontrada no cabeçalho.'] }
  }
  const rows: ImportComposicaoRow[] = []
  let current: ImportComposicaoRow | null = null

  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const rawCodigo  = 'codigo' in cols ? String(row[cols.codigo] ?? '').trim() : ''
    const descricao  = String(row[cols.descricao] ?? '').trim()
    if (!descricao) continue

    if (rawCodigo) {
      current = {
        codigo: rawCodigo,
        descricao,
        unidade: 'unidade'  in cols ? String(row[cols.unidade]  ?? '').trim() : '',
        base:    defaultBase ?? null,
        insumos: [],
      }
      rows.push(current)
    } else {
      if (!current) {
        erros.push(`Linha ${i + 1}: "${descricao}" sem composição pai — ignorado.`)
        continue
      }
      current.insumos.push({
        codigo:   '',
        descricao,
        unidade:  'unidade'  in cols ? String(row[cols.unidade]  ?? '').trim() : '',
        custo:    'custo'    in cols ? parseNumber(row[cols.custo])              : 0,
        indice:   1,
        grupo:    'grupo'    in cols ? String(row[cols.grupo]    ?? '').trim() || null : null,
        base:     'base'     in cols ? String(row[cols.base]     ?? '').trim() || null : null,
        data_ref: 'data_ref' in cols ? String(row[cols.data_ref] ?? '').trim() || null : null,
      })
    }
  }
  return { rows, erros }
}

// ─── Parser insumos flat ──────────────────────────────────────────────────────
function parseFlat(data: unknown[][], defaultBase?: string): { rows: ImportInsumoRow[]; erros: string[] } {
  const erros: string[] = []
  if (data.length < 2) return { rows: [], erros: ['Planilha vazia.'] }
  const headerIdx = findHeaderRow(data)
  const header = (data[headerIdx] as unknown[]).map(String)
  const cols = detectCols(header)
  if (!('descricao' in cols)) {
    return { rows: [], erros: ['Coluna "descricao" não encontrada no cabeçalho.'] }
  }
  const rows: ImportInsumoRow[] = []
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const descricao = String(row[cols.descricao] ?? '').trim()
    if (!descricao) continue
    rows.push({
      codigo:   'codigo'   in cols ? String(row[cols.codigo]   ?? '').trim() : '',
      descricao,
      unidade:  'unidade'  in cols ? String(row[cols.unidade]  ?? '').trim() : '',
      custo:    'custo'    in cols ? parseNumber(row[cols.custo])              : 0,
      indice:   1,
      grupo:    'grupo'    in cols ? String(row[cols.grupo]    ?? '').trim() || null : null,
      base:     defaultBase ?? null,
      data_ref: 'data_ref' in cols ? String(row[cols.data_ref] ?? '').trim() || null : null,
    })
  }
  return { rows, erros }
}

// ─── Parser composições flat (cada linha = uma composição, sem sub-itens) ─────
// Usado para abas CS* do SINAPI, onde a planilha é um catálogo plano de serviços.
function parseFlatComposicoes(data: unknown[][], defaultBase?: string): { rows: ImportComposicaoRow[]; erros: string[] } {
  const erros: string[] = []
  if (data.length < 2) return { rows: [], erros: ['Planilha vazia.'] }
  const headerIdx = findHeaderRow(data)
  const header = (data[headerIdx] as unknown[]).map(String)
  const cols = detectCols(header)
  if (!('descricao' in cols)) {
    return { rows: [], erros: ['Coluna "descricao" não encontrada no cabeçalho.'] }
  }
  const rows: ImportComposicaoRow[] = []
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const descricao = String(row[cols.descricao] ?? '').trim()
    if (!descricao) continue
    rows.push({
      codigo:  'codigo'  in cols ? String(row[cols.codigo]  ?? '').trim() : '',
      descricao,
      unidade: 'unidade' in cols ? String(row[cols.unidade] ?? '').trim() : '',
      base:    defaultBase ?? null,
      insumos: [],
    })
  }
  return { rows, erros }
}

// ─── Detecção e parser SUDECAP Relatório de Composições ──────────────────────
// Formato: CÓDIGO | DESCRIÇÃO | UND | CONSUMO
// Linhas sem CONSUMO = grupo ou composição (detectado pela profundidade do código)
// Linhas com CONSUMO > 0 = insumo da última composição

function inferSudecapRow(row: unknown[]): { codigo: string; descricao: string; unidade: string; consumoStr: string } {
  const cells = row.map(c => String(c ?? '').trim())
  let rightIdx = -1
  for (let j = cells.length - 1; j >= 0; j--) { if (cells[j]) { rightIdx = j; break } }
  const rightRaw = rightIdx >= 0 ? row[rightIdx] : ''
  const rightVal = rightIdx >= 0 ? cells[rightIdx] : ''
  const rightNum = typeof rightRaw === 'number' ? rightRaw : parseFloat(rightVal.replace(',', '.'))
  const isInsumo = rightVal !== '' && !isNaN(rightNum) && rightNum > 0 && rightNum < 100000
    && (typeof rightRaw === 'number' || /[,.]/.test(rightVal))
  let leftIdx = -1
  for (let j = 0; j < cells.length; j++) { if (cells[j]) { leftIdx = j; break } }
  const codigo = leftIdx >= 0 ? cells[leftIdx] : ''
  let unidade = ''
  if (isInsumo && rightIdx > 0) {
    for (let j = rightIdx - 1; j > leftIdx; j--) {
      const v = cells[j]
      if (v && v.length <= 6 && !/\d{5}/.test(v)) { unidade = v; break }
    }
  }
  let descricao = ''
  for (let j = leftIdx + 1; j < cells.length; j++) {
    const v = cells[j]
    if (!v || v === unidade || v === rightVal || j === rightIdx) continue
    if (v.length > descricao.length) descricao = v
  }
  return { codigo, descricao, unidade, consumoStr: isInsumo ? rightVal : '' }
}

function sniffSudecapRelatorio(data: unknown[][]): boolean {
  let hits = 0
  for (let i = 0; i < Math.min(data.length, 60); i++) {
    const { codigo, consumoStr } = inferSudecapRow(data[i] as unknown[])
    if (consumoStr && /\d+\.\d+/.test(codigo)) hits++
    if (hits >= 2) return true
  }
  return false
}

function parseSudecapRelatorio(data: unknown[][], defaultBase?: string): { rows: ImportComposicaoRow[]; erros: string[] } {
  const rows: ImportComposicaoRow[] = []
  if (data.length < 2) return { rows, erros: [] }
  let current: ImportComposicaoRow | null = null
  const GRUPOS_SUDECAP = new Set(['PC', 'A', 'S', 'E', 'H', 'HH', 'M', 'B', 'AC', 'L'])

  for (let i = 0; i < data.length; i++) {
    const { codigo, descricao, unidade, consumoStr } = inferSudecapRow(data[i] as unknown[])
    if (!codigo && !descricao) continue
    const consumo = parseNumber(consumoStr)

    if (consumoStr && consumo > 0) {
      if (!current) continue
      let desc = descricao
      let grupo: string | null = null
      const m = desc.match(/\s+([A-Za-z]{1,3})$/)
      if (m && GRUPOS_SUDECAP.has(m[1].toUpperCase())) {
        grupo = m[1].toUpperCase()
        desc = desc.slice(0, desc.length - m[0].length).trim()
      }
      current.insumos.push({ codigo, descricao: desc, unidade, custo: 0, indice: consumo, grupo, base: null, data_ref: null })
    } else {
      const dotCount = (codigo.match(/\./g) ?? []).length
      if (dotCount >= 2) {
        current = { codigo, descricao, unidade, base: defaultBase ?? null, insumos: [] }
        rows.push(current)
      } else {
        current = null
      }
    }
  }
  return { rows: rows.filter(r => r.insumos.length > 0), erros: [] }
}

// ─── Parser CSV ──────────────────────────────────────────────────────────────
function parseCsvText(text: string): unknown[][] {
  const cleaned = text.replace(/^﻿/, '') // remove BOM
  const lines = cleaned.split(/\r?\n/)
  if (lines.length === 0) return []
  const firstLine = lines[0]
  const delimiter = firstLine.includes(';') ? ';' : ','
  return lines
    .map(line => line.split(delimiter))
    .filter(cols => cols.some(c => c.trim() !== ''))
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function ResultBox({ result }: { result: ImportResult }) {
  const ok = result.erros.length === 0
  return (
    <div className={`rounded-lg border p-4 ${ok ? 'border-green-300 bg-green-50' : 'border-orange-300 bg-orange-50'}`}>
      <p className={`font-semibold text-sm mb-1 ${ok ? 'text-green-800' : 'text-orange-800'}`}>
        {ok ? 'Importação concluída com sucesso!' : 'Importação concluída com avisos'}
      </p>
      <p className="text-sm text-gray-700">
        {result.composicoesCriadas > 0 && <>{result.composicoesCriadas} composição(ões), </>}
        {result.insumosCriados} insumo(s) importados.
      </p>
      {result.erros.length > 0 && (
        <ul className="mt-2 text-xs text-orange-700 space-y-1">
          {result.erros.map((e, i) => <li key={i}>• {e}</li>)}
        </ul>
      )}
    </div>
  )
}

// ─── Aba: Importar Insumos ────────────────────────────────────────────────────

function ImportarInsumosTab({ orcamentoId }: { orcamentoId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [wbRef, setWbRef] = useState<unknown>(null)
  const [fonte, setFonte] = useState('')
  const [preview, setPreview] = useState<ImportInsumoRow[] | null>(null)
  const [parseErros, setParseErros] = useState<string[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null); setPreview(null); setParseErros([])

    if (file.name.toLowerCase().endsWith('.csv')) {
      const text = await file.text()
      const data = parseCsvText(text)
      const { rows, erros } = parseFlat(data, fonte || undefined)
      setPreview(rows); setParseErros(erros)
      setSheets([]); setWbRef(null); setSelectedSheet('')
      return
    }

    const ab = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(ab, { type: 'array' })
    setWbRef(wb)
    const names = wb.SheetNames
    setSheets(names)
    setSelectedSheet(names[0])
    processSheet(wb, names[0])
  }

  function processSheet(wb: unknown, name: string) {
    void import('xlsx').then(XLSX => {
      const _wb = wb as { Sheets: Record<string, unknown>; SheetNames: string[] }
      const ws = _wb.Sheets[name]
      if (!ws) return
      const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
      const { rows, erros } = parseFlat(data, fonte || undefined)
      setPreview(rows); setParseErros(erros)
    })
  }

  function onSheetChange(name: string) {
    setSelectedSheet(name)
    if (wbRef) processSheet(wbRef, name)
  }

  async function handleImport() {
    if (!preview?.length) return
    setLoading(true)
    try {
      const fonteVal = fonte.trim() || null
      const res = await importarInsumos(orcamentoId, preview.map(r => ({ ...r, base: fonteVal })))
      setResult(res); setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
      setSheets([]); setWbRef(null)
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      logAction(sb, {
        usuario: user?.email ?? '',
        tipo: res.erros.length > 0 ? 'info' : 'sucesso',
        acao: 'importar_insumos',
        mensagem: `${res.insumosCriados} insumo(s) importados${fonteVal ? ` da base "${fonteVal}"` : ''}`,
        contexto: { orcamento_id: orcamentoId, ...res },
      }).catch(console.error)
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Fonte / Base:</label>
        <input
          type="text"
          value={fonte}
          onChange={e => setFonte(e.target.value)}
          placeholder="ex: SINAPI, SUDECAP, Cotação Maio/2026"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-2">Planilha <strong>.xlsx</strong> ou <strong>.csv</strong> — cada linha = um insumo</p>
        <p className="text-xs text-gray-400 mb-4">Colunas: <em>codigo, descricao, unidade, custo, grupo, data_ref</em></p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.ods,.csv" onChange={handleFile}
          className="block mx-auto text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:text-sm file:font-medium hover:file:bg-blue-700 cursor-pointer" />
      </div>

      {sheets.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Aba da planilha:</label>
          <select value={selectedSheet} onChange={e => onSheetChange(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {sheets.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {parseErros.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3">
          <p className="text-xs font-semibold text-yellow-800 mb-1">Avisos:</p>
          <ul className="text-xs text-yellow-700 space-y-0.5">{parseErros.slice(0,10).map((e, i) => <li key={i}>• {e}</li>)}</ul>
          {parseErros.length > 10 && <p className="text-xs text-yellow-600 mt-1">...e mais {parseErros.length - 10} avisos.</p>}
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">{preview.length} insumo(s)</p>
            <button onClick={handleImport} disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Importando...' : 'Confirmar Importação'}
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>{['Código','Descrição','Unid.','Custo','Grupo','Base'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.slice(0, 200).map((ins, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono">{ins.codigo || '—'}</td>
                    <td className="px-3 py-2">{ins.descricao}</td>
                    <td className="px-3 py-2 text-gray-500">{ins.unidade}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {ins.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-3 py-2 text-gray-400">{ins.grupo ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-400">{ins.base ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {result && <ResultBox result={result} />}
    </div>
  )
}

// ─── Aba: Importar Composições ────────────────────────────────────────────────

function ImportarComposicoesTab({ orcamentoId }: { orcamentoId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [wbRef, setWbRef] = useState<unknown>(null)
  const [fileBase, setFileBase] = useState('')
  const [format, setFormat] = useState<'sudecap' | 'simples'>('simples')
  const [preview, setPreview] = useState<ImportComposicaoRow[] | null>(null)
  const [parseErros, setParseErros] = useState<string[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null); setPreview(null); setParseErros([])
    const baseName = fileBase || file.name.replace(/\.[^.]+$/, '')
    if (!fileBase) setFileBase(baseName)

    if (file.name.toLowerCase().endsWith('.csv')) {
      const text = await file.text()
      const data = parseCsvText(text)
      const header = (data[0] as unknown[]).map(String)
      const detected = isSudecap(header) ? 'sudecap' : 'simples'
      setFormat(detected)
      const { rows, erros } = detected === 'sudecap'
        ? parseSudecap(data, baseName)
        : parseSimples(data, baseName)
      setPreview(rows); setParseErros(erros)
      setSheets([]); setWbRef(null); setSelectedSheet('')
      return
    }

    const ab = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(ab, { type: 'array' })
    setWbRef(wb)
    const names = wb.SheetNames
    setSheets(names)
    setSelectedSheet(names[0])
    processSheet(wb, names[0], baseName)
  }

  function processSheet(wb: unknown, name: string, base?: string) {
    const defaultBase = base ?? fileBase
    void import('xlsx').then(XLSX => {
      const _wb = wb as { Sheets: Record<string, unknown>; SheetNames: string[] }
      const ws = _wb.Sheets[name]
      if (!ws) return
      const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
      if (data.length < 2) { setPreview([]); return }
      const header = (data[0] as unknown[]).map(String)
      const detected = isSudecap(header) ? 'sudecap' : 'simples'
      setFormat(detected)
      const { rows, erros } = detected === 'sudecap' ? parseSudecap(data, defaultBase) : parseSimples(data, defaultBase)
      setPreview(rows); setParseErros(erros)
    })
  }

  function onSheetChange(name: string) {
    setSelectedSheet(name)
    if (wbRef) processSheet(wbRef, name)
  }

  async function handleImport() {
    if (!preview?.length) return
    setLoading(true)
    try {
      const fonteVal = fileBase.trim() || null
      const res = await importarComposicoes(orcamentoId, preview.map(c => ({ ...c, base: fonteVal })))
      setResult(res); setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
      setSheets([]); setWbRef(null)
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      logAction(sb, {
        usuario: user?.email ?? '',
        tipo: res.erros.length > 0 ? 'info' : 'sucesso',
        acao: 'importar_composicoes',
        mensagem: `${res.composicoesCriadas} composição(ões) importada(s)${fonteVal ? ` da base "${fonteVal}"` : ''}`,
        contexto: { orcamento_id: orcamentoId, ...res },
      }).catch(console.error)
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally { setLoading(false) }
  }

  const totalInsumos = preview?.reduce((s, c) => s + c.insumos.length, 0) ?? 0

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Fonte / Base:</label>
        <input
          type="text"
          value={fileBase}
          onChange={e => setFileBase(e.target.value)}
          placeholder="ex: SINAPI, SUDECAP, Cotação Maio/2026"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-2">
          Planilha <strong>.xlsx</strong> hierárquica — composições + insumos
        </p>
        <p className="text-xs text-gray-400 mb-4">
          Detecta automaticamente o formato SUDECAP/SINAPI (colunas separadas para insumos) ou formato simples
          (linha com código = composição, linha sem código = insumo filho).
        </p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.ods,.csv" onChange={handleFile}
          className="block mx-auto text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:text-sm file:font-medium hover:file:bg-blue-700 cursor-pointer" />
      </div>

      {sheets.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Aba da planilha:</label>
          <select value={selectedSheet} onChange={e => onSheetChange(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {sheets.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {preview !== null && (
        <p className="text-xs text-gray-400">
          Formato detectado: <strong>{format === 'sudecap' ? 'SUDECAP/SINAPI' : 'Simples (hierárquico)'}</strong>
        </p>
      )}

      {parseErros.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3">
          <p className="text-xs font-semibold text-yellow-800 mb-1">Avisos ({parseErros.length}):</p>
          <ul className="text-xs text-yellow-700 space-y-0.5">
            {parseErros.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
          {parseErros.length > 10 && <p className="text-xs text-yellow-600 mt-1">...e mais {parseErros.length - 10} avisos.</p>}
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              {preview.length} composição(ões) · {totalInsumos} insumo(s)
            </p>
            <button onClick={handleImport} disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Importando...' : 'Confirmar Importação'}
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>{['Tipo','Código','Descrição','Unid.',
                  format === 'sudecap' ? 'Cód. Insumo' : 'Custo'
                ].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.slice(0, 50).map((comp, ci) => (
                  <Fragment key={ci}>
                    <tr className="bg-blue-50">
                      <td className="px-3 py-2 font-semibold text-blue-700">Composição</td>
                      <td className="px-3 py-2 font-mono text-blue-700">{comp.codigo}</td>
                      <td className="px-3 py-2 font-medium text-blue-800">{comp.descricao}</td>
                      <td className="px-3 py-2 text-blue-600">{comp.unidade}</td>
                      <td className="px-3 py-2 text-blue-400">
                        {comp.insumos.length} insumo(s)
                      </td>
                    </tr>
                    {comp.insumos.slice(0, 5).map((ins, ii) => (
                      <tr key={`i-${ci}-${ii}`} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-400 pl-6">↳ Insumo</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{ins.codigo || '—'}</td>
                        <td className="px-3 py-2 text-gray-700">{ins.descricao}</td>
                        <td className="px-3 py-2 text-gray-500">{ins.unidade}</td>
                        <td className="px-3 py-2 text-gray-400">
                          {format === 'sudecap' ? ins.codigo : ins.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                    ))}
                    {comp.insumos.length > 5 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-1 text-xs text-gray-400 pl-10 italic">
                          ...e mais {comp.insumos.length - 5} insumo(s)
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {preview.length > 50 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-2 text-xs text-gray-400 text-center italic">
                      Mostrando 50 de {preview.length} composições. Todas serão importadas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {result && <ResultBox result={result} />}
    </div>
  )
}

// ─── Aba: Importar SUDECAP ────────────────────────────────────────────────────

function ImportarSUDECAPTab({ orcamentoId }: { orcamentoId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [wbRef, setWbRef] = useState<unknown>(null)
  const [fileBase, setFileBase] = useState('SUDECAP')
  const [preview, setPreview] = useState<ImportComposicaoRow[] | null>(null)
  const [parseErros, setParseErros] = useState<string[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)

  function processData(data: unknown[][], base: string) {
    if (data.length < 2) { setPreview([]); return }
    const { rows, erros } = sniffSudecapRelatorio(data)
      ? parseSudecapRelatorio(data, base)
      : parseSudecap(data, base)
    setPreview(rows); setParseErros(erros)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null); setPreview(null); setParseErros([])

    const ab = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(ab, { type: 'array' })
    setWbRef(wb)
    const names = wb.SheetNames
    setSheets(names)
    setSelectedSheet(names[0])
    const ws = (wb as any).Sheets[names[0]]
    if (ws) {
      const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
      processData(data, fileBase)
    }
  }

  function onSheetChange(name: string) {
    setSelectedSheet(name)
    void import('xlsx').then(XLSX => {
      const ws = (wbRef as any)?.Sheets[name]
      if (!ws) return
      const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
      processData(data, fileBase)
    })
  }

  async function handleImport() {
    if (!preview?.length) return
    setLoading(true)
    try {
      const res = await importarComposicoes(orcamentoId, preview.map(c => ({ ...c, base: fileBase || null })))
      setResult(res); setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
      setSheets([]); setWbRef(null)
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      logAction(sb, {
        usuario: user?.email ?? '',
        tipo: res.erros.length > 0 ? 'info' : 'sucesso',
        acao: 'importar_sudecap',
        mensagem: `SUDECAP: ${res.composicoesCriadas} composição(ões), ${res.insumosCriados} insumo(s) importados`,
        contexto: { orcamento_id: orcamentoId, ...res },
      }).catch(console.error)
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally { setLoading(false) }
  }

  const totalInsumos = preview?.reduce((s, c) => s + c.insumos.length, 0) ?? 0

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
        <p className="font-semibold mb-1">Formato esperado: Relatório de Composições de Custo Horário (SUDECAP)</p>
        <p>Colunas: <strong>CÓDIGO · DESCRIÇÃO · UND · CONSUMO</strong> — linhas com CONSUMO preenchido = insumos; demais = grupos/composições.</p>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Fonte / Base:</label>
        <input type="text" value={fileBase} onChange={e => setFileBase(e.target.value)}
          placeholder="ex: SUDECAP Abril/2026"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
      </div>
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-2">Arquivo <strong>.xlsx</strong> exportado da tabela SUDECAP</p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.ods" onChange={handleFile}
          className="block mx-auto text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:text-sm file:font-medium hover:file:bg-blue-700 cursor-pointer" />
      </div>

      {sheets.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Aba da planilha:</label>
          <select value={selectedSheet} onChange={e => onSheetChange(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {sheets.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {parseErros.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3">
          <ul className="text-xs text-yellow-700 space-y-0.5">{parseErros.slice(0,10).map((e, i) => <li key={i}>• {e}</li>)}</ul>
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">{preview.length} composição(ões) · {totalInsumos} insumo(s)</p>
            <button onClick={handleImport} disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Importando...' : 'Confirmar Importação'}
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>{['Código', 'Descrição', 'Unid.', 'Insumos'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.slice(0, 50).map((comp, ci) => (
                  <Fragment key={ci}>
                    <tr className="bg-blue-50">
                      <td className="px-3 py-2 font-mono text-blue-700">{comp.codigo}</td>
                      <td className="px-3 py-2 font-medium text-blue-800" colSpan={2}>{comp.descricao}</td>
                      <td className="px-3 py-2 text-blue-400">{comp.insumos.length} insumo(s)</td>
                    </tr>
                    {comp.insumos.slice(0, 4).map((ins, ii) => (
                      <tr key={ii} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-500 pl-6">{ins.codigo}</td>
                        <td className="px-3 py-2 text-gray-700">{ins.descricao}{ins.grupo ? ` [${ins.grupo}]` : ''}</td>
                        <td className="px-3 py-2 text-gray-500">{ins.unidade}</td>
                        <td className="px-3 py-2 text-gray-400 tabular-nums">{ins.indice}</td>
                      </tr>
                    ))}
                    {comp.insumos.length > 4 && (
                      <tr><td colSpan={4} className="px-3 py-1 text-xs text-gray-400 pl-10 italic">...e mais {comp.insumos.length - 4} insumo(s)</td></tr>
                    )}
                  </Fragment>
                ))}
                {preview.length > 50 && (
                  <tr><td colSpan={4} className="px-3 py-2 text-xs text-gray-400 text-center italic">Mostrando 50 de {preview.length} composições.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {preview && preview.length === 0 && (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3">
          Nenhuma composição encontrada. Verifique se o arquivo está no formato SUDECAP (colunas CÓDIGO · DESCRIÇÃO · UND · CONSUMO).
        </p>
      )}

      {result && <ResultBox result={result} />}
    </div>
  )
}

// ─── Parser DNIT/SICRO ────────────────────────────────────────────────────────

function isSICROData(data: unknown[][]): boolean {
  for (let i = 0; i < Math.min(data.length, 40); i++) {
    for (const cell of data[i] as unknown[]) {
      const s = String(cell ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
      if (s.includes('sicro') || s.includes('sistema de custos referenciais')) return true
    }
  }
  return false
}

function parseSICROSheet(data: unknown[][], defaultBase?: string): { rows: ImportComposicaoRow[]; erros: string[] } {
  const rows: ImportComposicaoRow[] = []
  let current: ImportComposicaoRow | null = null
  let secao: 'A'|'B'|'C'|'D'|'E'|null = null
  let producao = 1
  let compUnit = ''

  const normS = (v: unknown) =>
    String(v ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()

  function extractProducao(row: unknown[]): { val: number; unit: string } | null {
    for (let k = 0; k < row.length; k++) {
      const ns = normS(row[k])
      if (!ns.includes('producao da equipe') && !ns.includes('producao equipe')) continue
      for (let l = k; l < Math.min(row.length, k + 4); l++) {
        const s = String(row[l] ?? '').trim()
        const m = s.match(/([\d]+[.,][\d]+)/)
        if (!m) continue
        const val = parseNumber(m[1])
        if (val <= 0 || val > 100000) continue
        let unit = s.slice(s.indexOf(m[0]) + m[0].length).trim()
        if (!unit) {
          const nxt = String(row[l + 1] ?? '').trim()
          if (nxt && nxt.length <= 10 && !/^\d/.test(nxt)) unit = nxt
        }
        return { val, unit }
      }
    }
    return null
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i] as unknown[]
    const cells = row.map(c => String(c ?? '').trim())
    if (cells.every(c => !c)) continue

    const first = cells.find(c => c) ?? ''
    const firstN = normS(first)

    // Section marker: "A - EQUIPAMENTOS", "B - MÃO DE OBRA", etc.
    const secM = firstN.match(/^([a-e])\s*[-–]\s*(equipament|mao de obra|material|atividad|tempo)/)
    if (secM) {
      secao = secM[1].toUpperCase() as 'A'|'B'|'C'|'D'|'E'
      continue
    }

    // Composition header: starts with 7+ digits
    const compM = first.match(/^(\d{7,})\s*(.*)/)
    if (compM) {
      const cod = compM[1]
      let desc = compM[2].trim()
      if (!desc) {
        for (let j = 1; j < cells.length; j++) {
          if (cells[j] && cells[j].length > 3) { desc = cells[j]; break }
        }
      }
      producao = 1; compUnit = ''
      for (let scan = Math.max(0, i - 5); scan < Math.min(data.length, i + 8); scan++) {
        const p = extractProducao(data[scan] as unknown[])
        if (p) { producao = p.val; compUnit = p.unit; break }
      }
      current = { codigo: cod, descricao: desc || cod, unidade: compUnit, base: defaultBase ?? null, insumos: [] }
      rows.push(current)
      secao = null
      continue
    }

    if (!current || !secao) continue
    if (!/^[A-Z]\d{4}/.test(first)) continue
    if (/custo|total|subtotal|producao/.test(firstN)) continue

    const desc2 = cells[1] ?? ''
    const nums: number[] = []
    let unit2 = ''
    for (let j = 2; j < cells.length; j++) {
      const v = parseNumber(cells[j])
      if (v > 0) nums.push(v)
      else if (!unit2 && cells[j] && cells[j].length <= 8 && !/^\d/.test(cells[j])) unit2 = cells[j]
    }
    if (!nums.length) continue

    const qty = nums[0]
    const unitCost = nums.length >= 2 ? nums[nums.length - 2] : nums[0]
    const isLabor = secao === 'B' || secao === 'A'
    const rawIndice = isLabor ? (producao > 0 ? qty / producao : qty) : qty
    const indice = Math.min(Math.max(rawIndice, 0.000001), 99999999)
    const custo = Math.min(unitCost, 9999999999)
    if (!isFinite(indice) || !isFinite(custo)) continue
    const grupo = secao === 'A' ? 'Equipamento' : secao === 'B' ? 'Mao de Obra'
               : secao === 'C' ? 'Material' : secao === 'D' ? 'Atividade Auxiliar' : null

    current.insumos.push({ codigo: first, descricao: desc2, unidade: unit2, custo, indice, grupo, base: null, data_ref: null })
  }

  return { rows: rows.filter(r => r.insumos.length > 0), erros: [] }
}

// ─── Aba: Importar DNIT/SICRO ─────────────────────────────────────────────────

function ImportarDNITTab({ orcamentoId }: { orcamentoId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [wbRef, setWbRef] = useState<unknown>(null)
  const [fileBase, setFileBase] = useState('DNIT/SICRO')
  const [preview, setPreview] = useState<ImportComposicaoRow[] | null>(null)
  const [parseErros, setParseErros] = useState<string[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)

  function processData(data: unknown[][], base: string) {
    if (data.length < 2) { setPreview([]); return }
    const { rows, erros } = parseSICROSheet(data, base)
    setPreview(rows); setParseErros(erros)
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null); setPreview(null); setParseErros([])
    const ab = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(ab, { type: 'array' })
    setWbRef(wb)
    const names = wb.SheetNames
    setSheets(names)
    setSelectedSheet(names[0])
    const ws = (wb as any).Sheets[names[0]]
    if (ws) {
      const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
      processData(data, fileBase)
    }
  }

  function onSheetChange(name: string) {
    setSelectedSheet(name)
    void import('xlsx').then(XLSX => {
      const ws = (wbRef as any)?.Sheets[name]
      if (!ws) return
      const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
      processData(data, fileBase)
    })
  }

  async function handleImport() {
    if (!preview?.length) return
    setLoading(true)
    try {
      const res = await importarComposicoes(orcamentoId, preview.map(c => ({ ...c, base: fileBase || null })))
      setResult(res); setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
      setSheets([]); setWbRef(null)
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      logAction(sb, {
        usuario: user?.email ?? '',
        tipo: res.erros.length > 0 ? 'info' : 'sucesso',
        acao: 'importar_dnit',
        mensagem: `DNIT/SICRO: ${res.composicoesCriadas} composição(ões), ${res.insumosCriados} insumo(s) importados`,
        contexto: { orcamento_id: orcamentoId, ...res },
      }).catch(console.error)
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally { setLoading(false) }
  }

  const totalInsumos = preview?.reduce((s, c) => s + c.insumos.length, 0) ?? 0

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-800">
        <p className="font-semibold mb-1">Formato esperado: Fichas SICRO (DNIT)</p>
        <p>Detecta seções <strong>A</strong> (Equipamentos), <strong>B</strong> (Mão de Obra), <strong>C</strong> (Material) e normaliza os coeficientes pela <em>Produção da Equipe</em>.</p>
      </div>
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Fonte / Base:</label>
        <input type="text" value={fileBase} onChange={e => setFileBase(e.target.value)}
          placeholder="ex: DNIT/SICRO Abril/2025"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
      </div>
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-2">Arquivo <strong>.xlsx</strong> exportado do SICRO/DNIT</p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.ods" onChange={handleFile}
          className="block mx-auto text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:text-sm file:font-medium hover:file:bg-blue-700 cursor-pointer" />
      </div>

      {sheets.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Aba da planilha:</label>
          <select value={selectedSheet} onChange={e => onSheetChange(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            {sheets.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {parseErros.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3">
          <ul className="text-xs text-yellow-700 space-y-0.5">{parseErros.slice(0,10).map((e, i) => <li key={i}>• {e}</li>)}</ul>
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">{preview.length} composição(ões) · {totalInsumos} insumo(s)</p>
            <button onClick={handleImport} disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Importando...' : 'Confirmar Importação'}
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>{['Código', 'Descrição', 'Unid.', 'Insumos'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-gray-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.slice(0, 50).map((comp, ci) => (
                  <Fragment key={ci}>
                    <tr className="bg-blue-50">
                      <td className="px-3 py-2 font-mono text-blue-700">{comp.codigo}</td>
                      <td className="px-3 py-2 font-medium text-blue-800" colSpan={2}>{comp.descricao}</td>
                      <td className="px-3 py-2 text-blue-400">{comp.insumos.length} insumo(s)</td>
                    </tr>
                    {comp.insumos.slice(0, 4).map((ins, ii) => (
                      <tr key={ii} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-500 pl-6">{ins.codigo}</td>
                        <td className="px-3 py-2 text-gray-700">{ins.descricao}{ins.grupo ? ` [${ins.grupo}]` : ''}</td>
                        <td className="px-3 py-2 text-gray-500">{ins.unidade}</td>
                        <td className="px-3 py-2 text-gray-400 tabular-nums">
                          {ins.indice.toFixed(5)} × {ins.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                    ))}
                    {comp.insumos.length > 4 && (
                      <tr><td colSpan={4} className="px-3 py-1 text-xs text-gray-400 pl-10 italic">...e mais {comp.insumos.length - 4} insumo(s)</td></tr>
                    )}
                  </Fragment>
                ))}
                {preview.length > 50 && (
                  <tr><td colSpan={4} className="px-3 py-2 text-xs text-gray-400 text-center italic">Mostrando 50 de {preview.length} composições.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {preview && preview.length === 0 && (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3">
          Nenhuma composição SICRO encontrada. Verifique se o arquivo está no formato DNIT/SICRO.
        </p>
      )}

      {result && <ResultBox result={result} />}
    </div>
  )
}

// ─── Detecção de regimes SINAPI ───────────────────────────────────────────────

interface SINAPIRegime {
  suffix: string
  isSheet: string | null
  csSheet: string | null
}

function detectSINAPIRegimes(sheets: string[]): SINAPIRegime[] {
  const isMap = new Map<string, string>()
  const csMap = new Map<string, string>()
  for (const s of sheets) {
    const u = s.toUpperCase().trim()
    if (/^IS[A-Z]+$/.test(u)) isMap.set(u.slice(2), s)
    else if (/^CS[A-Z]+$/.test(u)) csMap.set(u.slice(2), s)
  }
  const suffixes = new Set([...isMap.keys(), ...csMap.keys()])
  return [...suffixes].map(suffix => ({
    suffix,
    isSheet: isMap.get(suffix) ?? null,
    csSheet: csMap.get(suffix) ?? null,
  }))
}

// ─── Aba: Importar SINAPI ─────────────────────────────────────────────────────

function ImportarSINAPITab({ orcamentoId }: { orcamentoId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [regimes, setRegimes] = useState<SINAPIRegime[]>([])
  const [selectedSuffix, setSelectedSuffix] = useState<string | null>(null)
  const [wbRef, setWbRef] = useState<unknown>(null)
  const [previewCounts, setPreviewCounts] = useState<{ insumos: number; composicoes: number } | null>(null)
  const [parseErros, setParseErros] = useState<string[]>([])
  const [pendingData, setPendingData] = useState<{
    insumos: ImportInsumoRow[]
    composicoes: ImportComposicaoRow[]
  } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)

  function processSheetsFromWb(wb: unknown, regime: SINAPIRegime) {
    void import('xlsx').then(XLSX => {
      const _wb = wb as { Sheets: Record<string, unknown> }
      const erros: string[] = []
      let insumos: ImportInsumoRow[] = []
      let composicoes: ImportComposicaoRow[] = []
      const defaultBase = fileName.replace(/\.[^.]+$/, '')

      if (regime.isSheet) {
        const ws = _wb.Sheets[regime.isSheet]
        if (ws) {
          const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
          const r = parseFlat(data)
          insumos = r.rows
          erros.push(...r.erros.map(e => `[${regime.isSheet}] ${e}`))
        }
      }

      if (regime.csSheet) {
        const ws = _wb.Sheets[regime.csSheet]
        if (ws) {
          const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
          if (data.length >= 2) {
            const header = (data[0] as unknown[]).map(String)
            // SINAPI CS* sheets are flat catalogs (each row = one composition, no sub-items).
            // Only use the SUDECAP parser when the sheet explicitly signals a hierarchical structure.
            const r = isSudecap(header) ? parseSudecap(data, defaultBase) : parseFlatComposicoes(data, defaultBase)
            composicoes = r.rows
            erros.push(...r.erros.map(e => `[${regime.csSheet}] ${e}`))
          }
        }
      }

      setPendingData({ insumos, composicoes })
      setPreviewCounts({ insumos: insumos.length, composicoes: composicoes.length })
      setParseErros(erros)
    })
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null); setPreviewCounts(null); setParseErros([]); setPendingData(null)
    setFileName(file.name)
    const ab = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(ab, { type: 'array' })
    setWbRef(wb)
    const detected = detectSINAPIRegimes(wb.SheetNames)
    setRegimes(detected)
    if (detected.length > 0) {
      setSelectedSuffix(detected[0].suffix)
      processSheetsFromWb(wb, detected[0])
    } else {
      setSelectedSuffix(null)
    }
  }

  function onRegimeChange(suffix: string) {
    setSelectedSuffix(suffix)
    setPreviewCounts(null); setPendingData(null); setParseErros([])
    const regime = regimes.find(r => r.suffix === suffix)
    if (regime && wbRef) processSheetsFromWb(wbRef, regime)
  }

  async function handleImport() {
    if (!pendingData) return
    setLoading(true)
    const combined: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [] }
    try {
      if (pendingData.insumos.length > 0) {
        const r = await importarInsumos(orcamentoId, pendingData.insumos)
        combined.insumosCriados += r.insumosCriados
        combined.erros.push(...r.erros)
      }
      if (pendingData.composicoes.length > 0) {
        const r = await importarComposicoes(orcamentoId, pendingData.composicoes)
        combined.composicoesCriadas += r.composicoesCriadas
        combined.insumosCriados += r.insumosCriados
        combined.erros.push(...r.erros)
      }
      setResult(combined)
      setPendingData(null); setPreviewCounts(null)
      if (inputRef.current) inputRef.current.value = ''
      setWbRef(null); setRegimes([]); setSelectedSuffix(null)
      const nomeSinapi = fileName.replace(/\.[^.]+$/, '')
      setFileName('')
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      logAction(sb, {
        usuario: user?.email ?? '',
        tipo: combined.erros.length > 0 ? 'info' : 'sucesso',
        acao: 'importar_sinapi',
        mensagem: `SINAPI importado: ${combined.insumosCriados} insumo(s), ${combined.composicoesCriadas} composição(ões) — "${nomeSinapi}"`,
        contexto: { orcamento_id: orcamentoId, ...combined },
      }).catch(console.error)
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-1">Arquivo <strong>.xlsx</strong> da tabela de referência SINAPI</p>
        <p className="text-xs text-gray-400 mb-4">Detecta automaticamente as abas IS* (insumos) e CS* (composições)</p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.ods" onChange={handleFile}
          className="block mx-auto text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:text-sm file:font-medium hover:file:bg-blue-700 cursor-pointer" />
        {fileName && <p className="mt-2 text-xs text-gray-400">{fileName}</p>}
      </div>

      {fileName && regimes.length === 0 && (
        <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-3">
          Nenhuma aba SINAPI detectada (IS*/CS*). Use as abas "Importar Composições" ou "Importar Insumos Avulsos".
        </p>
      )}

      {regimes.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Regime de tributação:</p>
          <div className="flex flex-wrap gap-2">
            {regimes.map(r => (
              <label key={r.suffix} className={`flex items-center gap-2 cursor-pointer rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                selectedSuffix === r.suffix
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}>
                <input type="radio" name="regime" value={r.suffix}
                  checked={selectedSuffix === r.suffix}
                  onChange={() => onRegimeChange(r.suffix)}
                  className="text-blue-600 accent-blue-600" />
                <span className="font-mono">{r.suffix}</span>
                <span className="text-xs text-gray-400 font-normal">
                  {[r.isSheet, r.csSheet].filter(Boolean).join(' + ')}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {parseErros.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3">
          <p className="text-xs font-semibold text-yellow-800 mb-1">Avisos:</p>
          <ul className="text-xs text-yellow-700 space-y-0.5">
            {parseErros.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
          {parseErros.length > 5 && (
            <p className="text-xs text-yellow-600 mt-1">...e mais {parseErros.length - 5} avisos.</p>
          )}
        </div>
      )}

      {previewCounts && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-gray-800">Pronto para importar</p>
            <p className="text-xs text-gray-500">
              {previewCounts.insumos > 0 && <span>{previewCounts.insumos.toLocaleString('pt-BR')} insumo(s)</span>}
              {previewCounts.insumos > 0 && previewCounts.composicoes > 0 && <span> · </span>}
              {previewCounts.composicoes > 0 && <span>{previewCounts.composicoes.toLocaleString('pt-BR')} composição(ões)</span>}
              {previewCounts.insumos === 0 && previewCounts.composicoes === 0 && <span className="text-yellow-600">Nenhum dado encontrado nas abas selecionadas.</span>}
            </p>
          </div>
          {(previewCounts.insumos > 0 || previewCounts.composicoes > 0) && (
            <button onClick={handleImport} disabled={loading}
              className="shrink-0 rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Importando...' : 'Confirmar Importação'}
            </button>
          )}
        </div>
      )}

      {result && <ResultBox result={result} />}
    </div>
  )
}

// ─── Aba: Importar da Base ────────────────────────────────────────────────────

function ImportarDaBaseTab({ orcamentoId, bases }: { orcamentoId: string; bases: BaseInfo[] }) {
  const [selectedId, setSelectedId] = useState<string>(bases[0]?.id ?? '')
  const [opcoes, setOpcoes] = useState({ insumos: true, composicoes: true })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const base = bases.find(b => b.id === selectedId)

  async function handleImport() {
    if (!selectedId || (!opcoes.insumos && !opcoes.composicoes)) return
    setLoading(true)
    try {
      const r = await importarDaBase(orcamentoId, selectedId, opcoes)
      setResult(r)
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      logAction(sb, {
        usuario: user?.email ?? '',
        tipo: r.erros.length > 0 ? 'info' : 'sucesso',
        acao: 'importar_da_base',
        mensagem: `Base "${base?.orgao ?? selectedId}" importada: ${r.insumosCriados} insumo(s), ${r.composicoesCriadas} composição(ões)`,
        contexto: { orcamento_id: orcamentoId, base_id: selectedId, ...r },
      }).catch(console.error)
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally {
      setLoading(false)
    }
  }

  if (bases.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
        <p className="text-sm font-medium text-gray-700 mb-1">Nenhuma base cadastrada</p>
        <p className="text-xs text-gray-500">
          Importe insumos e composições na biblioteca global primeiro
          (menu <strong>Insumos → Importar</strong> ou <strong>Composições → Importar</strong>).
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-600">
        Copia insumos e/ou composições de uma base global cadastrada diretamente para este orçamento.
        Preços sempre atualizados a partir da base de referência.
      </p>

      {/* Seleção de base */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Base de referência:</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {bases.map(b => (
            <label key={b.id} className={`flex items-start gap-3 cursor-pointer rounded-lg border px-4 py-3 transition-colors ${
              selectedId === b.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}>
              <input type="radio" name="base" value={b.id} checked={selectedId === b.id}
                onChange={() => { setSelectedId(b.id); setResult(null) }}
                className="mt-0.5 accent-blue-600" />
              <div className="min-w-0">
                <p className={`text-sm font-medium ${selectedId === b.id ? 'text-blue-700' : 'text-gray-800'}`}>
                  {b.orgao}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {b.total_insumos > 0 && `${b.total_insumos.toLocaleString('pt-BR')} insumos`}
                  {b.total_insumos > 0 && b.total_composicoes > 0 && ' · '}
                  {b.total_composicoes > 0 && `${b.total_composicoes.toLocaleString('pt-BR')} composições`}
                  {b.total_insumos === 0 && b.total_composicoes === 0 && 'Base vazia'}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* O que importar */}
      {base && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">Importar:</p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input type="checkbox" checked={opcoes.insumos}
                onChange={e => setOpcoes(o => ({ ...o, insumos: e.target.checked }))}
                className="accent-blue-600" disabled={base.total_insumos === 0} />
              <span className={base.total_insumos === 0 ? 'text-gray-400' : ''}>
                Insumos {base.total_insumos > 0 && <span className="text-gray-400">({base.total_insumos.toLocaleString('pt-BR')})</span>}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input type="checkbox" checked={opcoes.composicoes}
                onChange={e => setOpcoes(o => ({ ...o, composicoes: e.target.checked }))}
                className="accent-blue-600" disabled={base.total_composicoes === 0} />
              <span className={base.total_composicoes === 0 ? 'text-gray-400' : ''}>
                Composições {base.total_composicoes > 0 && <span className="text-gray-400">({base.total_composicoes.toLocaleString('pt-BR')})</span>}
              </span>
            </label>
          </div>
          <p className="text-xs text-gray-400">
            Insumos já importados terão o preço atualizado da base. Composições já existentes são ignoradas.
          </p>
        </div>
      )}

      {!result && (
        <button onClick={handleImport}
          disabled={loading || !selectedId || (!opcoes.insumos && !opcoes.composicoes)}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {loading ? 'Importando...' : 'Importar para este orçamento'}
        </button>
      )}

      {result && <ResultBox result={result} />}
    </div>
  )
}

// ─── Form principal com abas ──────────────────────────────────────────────────

type Tab = 'base' | 'sinapi' | 'sudecap' | 'dnit' | 'composicoes' | 'insumos'

export function ImportForm({ orcamentoId, bases }: { orcamentoId: string; bases: BaseInfo[] }) {
  const [tab, setTab] = useState<Tab>(bases.length > 0 ? 'base' : 'composicoes')

  return (
    <div className="space-y-0">
      <div className="flex gap-0 border-b border-gray-200 mb-6 overflow-x-auto">
        {([
          { key: 'base',        label: 'Da Base Global' },
          { key: 'composicoes', label: 'Composições' },
          { key: 'insumos',     label: 'Insumos Avulsos' },
          { key: 'sinapi',      label: 'SINAPI (arquivo)' },
          { key: 'sudecap',     label: 'SUDECAP (arquivo)' },
          { key: 'dnit',        label: 'DNIT/SICRO (arquivo)' },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`whitespace-nowrap px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'base'        && <ImportarDaBaseTab       orcamentoId={orcamentoId} bases={bases} />}
      {tab === 'sinapi'      && <ImportarSINAPITab        orcamentoId={orcamentoId} />}
      {tab === 'sudecap'     && <ImportarSUDECAPTab       orcamentoId={orcamentoId} />}
      {tab === 'dnit'        && <ImportarDNITTab          orcamentoId={orcamentoId} />}
      {tab === 'composicoes' && <ImportarComposicoesTab   orcamentoId={orcamentoId} />}
      {tab === 'insumos'     && <ImportarInsumosTab       orcamentoId={orcamentoId} />}
    </div>
  )
}
