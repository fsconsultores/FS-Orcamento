'use client'

import { useState, useRef, Fragment } from 'react'
import { importarInsumos, importarComposicoes, importarDaBase } from './import-action'
import type { ImportComposicaoRow, ImportInsumoRow, ImportResult, BaseInfo } from './import-action'
import { createClient } from '@/lib/supabase/client'
import { registrarHistorico } from '@/lib/log'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import { ImportResultBox } from '@/components/import-result-box'
import { WizardSteps } from '@/components/ui/import-wizard'
import { Database } from 'lucide-react'

const STEPS_3 = [
  { key: 'arquivo', label: 'Arquivo' },
  { key: 'preview', label: 'Prévia' },
  { key: 'resultado', label: 'Resultado' },
]
const STEPS_2 = [
  { key: 'selecionar', label: 'Selecionar' },
  { key: 'resultado', label: 'Resultado' },
]

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
    <ImportResultBox variant={ok ? 'success' : 'warning'} title={ok ? 'Importação concluída com sucesso!' : 'Importação concluída com avisos'}>
      <p>
        {result.composicoesCriadas > 0 && <>{result.composicoesCriadas} composição(ões), </>}
        {result.insumosCriados} insumo(s) importados.
      </p>
      {result.erros.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-700">
          {result.erros.map((e, i) => <li key={i}>• {e}</li>)}
        </ul>
      )}
    </ImportResultBox>
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
      registrarHistorico(sb, {
        orcamentoId,
        entidade: 'insumo',
        tipo: res.erros.length > 0 ? 'info' : 'sucesso',
        acao: 'importar_insumos',
        mensagem: `${res.insumosCriados} insumo(s) importados${fonteVal ? ` da base "${fonteVal}"` : ''}`,
        detalhes: res as unknown as Record<string, unknown>,
      }).catch(console.error)
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally { setLoading(false) }
  }

  const step = result ? 'resultado' : preview && preview.length > 0 ? 'preview' : 'arquivo'

  return (
    <div className="space-y-5">
      <WizardSteps steps={STEPS_3} currentKey={step} />
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Fonte / Base:</label>
        <input
          type="text"
          value={fonte}
          onChange={e => setFonte(e.target.value)}
          placeholder="ex: SINAPI, SUDECAP, Cotação Maio/2026"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
        />
      </div>
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-2">Planilha <strong>.xlsx</strong> ou <strong>.csv</strong> — cada linha = um insumo</p>
        <p className="text-xs text-gray-400 mb-4">Colunas: <em>codigo, descricao, unidade, custo, grupo, data_ref</em></p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.ods,.csv" onChange={handleFile}
          className="block mx-auto text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-primary-700 file:text-white file:text-sm file:font-medium hover:file:bg-primary-800 cursor-pointer" />
      </div>

      {sheets.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Aba da planilha:</label>
          <select value={selectedSheet} onChange={e => onSheetChange(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20">
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
            <Button onClick={handleImport} loading={loading}>
              Confirmar Importação
            </Button>
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
      registrarHistorico(sb, {
        orcamentoId,
        entidade: 'composicao',
        tipo: res.erros.length > 0 ? 'info' : 'sucesso',
        acao: 'importar_composicoes',
        mensagem: `${res.composicoesCriadas} composição(ões) importada(s)${fonteVal ? ` da base "${fonteVal}"` : ''}`,
        detalhes: res as unknown as Record<string, unknown>,
      }).catch(console.error)
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally { setLoading(false) }
  }

  const totalInsumos = preview?.reduce((s, c) => s + c.insumos.length, 0) ?? 0
  const step = result ? 'resultado' : preview && preview.length > 0 ? 'preview' : 'arquivo'

  return (
    <div className="space-y-5">
      <WizardSteps steps={STEPS_3} currentKey={step} />
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Fonte / Base:</label>
        <input
          type="text"
          value={fileBase}
          onChange={e => setFileBase(e.target.value)}
          placeholder="ex: SINAPI, SUDECAP, Cotação Maio/2026"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
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
          className="block mx-auto text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-primary-700 file:text-white file:text-sm file:font-medium hover:file:bg-primary-800 cursor-pointer" />
      </div>

      {sheets.length > 1 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Aba da planilha:</label>
          <select value={selectedSheet} onChange={e => onSheetChange(e.target.value)}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20">
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
            <Button onClick={handleImport} loading={loading}>
              Confirmar Importação
            </Button>
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
                    <tr className="bg-primary-50">
                      <td className="px-3 py-2 font-semibold text-primary-700">Composição</td>
                      <td className="px-3 py-2 font-mono text-primary-700">{comp.codigo}</td>
                      <td className="px-3 py-2 font-medium text-primary-800">{comp.descricao}</td>
                      <td className="px-3 py-2 text-primary-600">{comp.unidade}</td>
                      <td className="px-3 py-2 text-primary-400">
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
      registrarHistorico(sb, {
        orcamentoId,
        entidade: 'base',
        tipo: r.erros.length > 0 ? 'info' : 'sucesso',
        acao: 'importar_da_base',
        mensagem: `Base "${base?.orgao ?? selectedId}" importada: ${r.insumosCriados} insumo(s), ${r.composicoesCriadas} composição(ões)`,
        detalhes: { base_id: selectedId, ...r },
      }).catch(console.error)
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally {
      setLoading(false)
    }
  }

  if (bases.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <EmptyState
          icon={<Database size={20} />}
          title="Nenhuma base cadastrada"
          description="Importe insumos e composições na biblioteca global primeiro (menu Insumos → Importar ou Composições → Importar)."
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <WizardSteps steps={STEPS_2} currentKey={result ? 'resultado' : 'selecionar'} />
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
                ? 'border-primary-500 bg-primary-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}>
              <input type="radio" name="base" value={b.id} checked={selectedId === b.id}
                onChange={() => { setSelectedId(b.id); setResult(null) }}
                className="mt-0.5 accent-primary-600" />
              <div className="min-w-0">
                <p className={`text-sm font-medium ${selectedId === b.id ? 'text-primary-700' : 'text-gray-800'}`}>
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
              <Checkbox checked={opcoes.insumos}
                onChange={e => setOpcoes(o => ({ ...o, insumos: e.target.checked }))}
                disabled={base.total_insumos === 0} />
              <span className={base.total_insumos === 0 ? 'text-gray-400' : ''}>
                Insumos {base.total_insumos > 0 && <span className="text-gray-400">({base.total_insumos.toLocaleString('pt-BR')})</span>}
              </span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <Checkbox checked={opcoes.composicoes}
                onChange={e => setOpcoes(o => ({ ...o, composicoes: e.target.checked }))}
                disabled={base.total_composicoes === 0} />
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
        <Button onClick={handleImport}
          disabled={!selectedId || (!opcoes.insumos && !opcoes.composicoes)}
          loading={loading}>
          Importar para este orçamento
        </Button>
      )}

      {result && <ResultBox result={result} />}
    </div>
  )
}

// ─── Form principal com abas ──────────────────────────────────────────────────

type Tab = 'base' | 'composicoes' | 'insumos'

export function ImportForm({ orcamentoId, bases }: { orcamentoId: string; bases: BaseInfo[] }) {
  const [tab, setTab] = useState<Tab>(bases.length > 0 ? 'base' : 'composicoes')

  return (
    <div className="space-y-0">
      <div className="flex gap-0 border-b border-gray-200 mb-6 overflow-x-auto">
        {([
          { key: 'base',        label: 'Da Base Global' },
          { key: 'composicoes', label: 'Composições' },
          { key: 'insumos',     label: 'Insumos Avulsos' },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`whitespace-nowrap px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-primary-700 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'base'        && <ImportarDaBaseTab       orcamentoId={orcamentoId} bases={bases} />}
      {tab === 'composicoes' && <ImportarComposicoesTab   orcamentoId={orcamentoId} />}
      {tab === 'insumos'     && <ImportarInsumosTab       orcamentoId={orcamentoId} />}
    </div>
  )
}
