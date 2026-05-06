'use client'

import { useState, useRef } from 'react'
import { importarInsumos, importarComposicoes } from './import-action'
import type { ImportComposicaoRow, ImportInsumoRow, ImportResult } from './import-action'

// ─── Helpers de parse ────────────────────────────────────────────────────────

const COL_ALIASES: Record<string, string[]> = {
  codigo:   ['codigo', 'código', 'cod', 'code'],
  descricao:['descricao', 'descrição', 'descr', 'description', 'nome', 'name',
             'descricaoabreviada', 'descrição abreviada', 'descricao abreviada'],
  unidade:  ['unidade', 'und', 'un', 'unit'],
  custo:    ['custo', 'preço', 'preco', 'price', 'valor', 'custo unitário'],
  grupo:    ['grupo', 'group', 'categoria'],
  base:     ['base', 'fonte', 'source'],
  data_ref: ['data_ref', 'data ref', 'data referência', 'ref'],
}

function parseNumber(val: unknown): number {
  if (typeof val === 'number') return val
  const s = String(val ?? '').replace(',', '.').replace(/[^\d.-]/g, '')
  return parseFloat(s) || 0
}

function detectCols(header: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  header.forEach((h, i) => {
    const lower = String(h ?? '').toLowerCase().trim().replace(/[^a-z0-9]/g, '')
    for (const [field, aliases] of Object.entries(COL_ALIASES)) {
      const normAliases = aliases.map(a => a.replace(/[^a-z0-9]/g, ''))
      if (normAliases.includes(lower) && !(field in map)) map[field] = i
    }
  })
  return map
}

// Detecta se o arquivo está no formato SUDECAP/SINAPI:
// cabeçalho tem colunas "TipoItemComposicao" e "DescricaoAbreviadaInsumo"
function isSudecap(header: string[]): boolean {
  const joined = header.join('|').toLowerCase()
  return joined.includes('tipoitem') || joined.includes('insumo/composicao') || joined.includes('insumocomposicao')
}

// ─── Parser SUDECAP/SINAPI ────────────────────────────────────────────────────
// Colunas fixas (índice 0-base):
//  0: Codigo composição  1: DescricaoAbreviada  2: Unidade
//  5: TipoItemComposicao (I=insumo direto, C=composição auxiliar)
//  6: CódigoDoInsumo     7: DescricaoAbreviadaInsumo  8: UnidadeInsumo
//  9: Indice             10: GrupoDoInsumo
function parseSudecap(data: unknown[][]): { rows: ImportComposicaoRow[]; erros: string[] } {
  const rows: ImportComposicaoRow[] = []
  let current: ImportComposicaoRow | null = null

  for (let i = 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const codigoComp  = String(row[0]  ?? '').trim()
    const descComp    = String(row[1]  ?? '').trim()
    const unidadeComp = String(row[2]  ?? '').trim()
    const tipoItem    = String(row[5]  ?? '').trim().toUpperCase()
    const codigoIns   = String(row[6]  ?? '').trim()
    const descIns     = String(row[7]  ?? '').trim()
    const unidadeIns  = String(row[8]  ?? '').trim()
    const grupo       = String(row[10] ?? '').trim() || null

    // Linha completamente vazia — pula
    if (!codigoComp && !descComp && !descIns) continue

    // Nova composição
    if (codigoComp && descComp) {
      current = { codigo: codigoComp, descricao: descComp, unidade: unidadeComp, base: null, insumos: [] }
      rows.push(current)
    }

    // Adiciona insumo do tipo I (direto). Ignora C (composição auxiliar) — sem precificação aqui.
    if (tipoItem === 'I' && descIns && current) {
      current.insumos.push({
        codigo: codigoIns,
        descricao: descIns,
        unidade: unidadeIns,
        custo: 0,   // base SUDECAP não traz preço unitário
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
function parseSimples(data: unknown[][]): { rows: ImportComposicaoRow[]; erros: string[] } {
  const erros: string[] = []
  const header = (data[0] as unknown[]).map(String)
  const cols = detectCols(header)
  if (!('descricao' in cols)) {
    return { rows: [], erros: ['Coluna "descricao" não encontrada no cabeçalho.'] }
  }
  const rows: ImportComposicaoRow[] = []
  let current: ImportComposicaoRow | null = null

  for (let i = 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const rawCodigo  = 'codigo' in cols ? String(row[cols.codigo] ?? '').trim() : ''
    const descricao  = String(row[cols.descricao] ?? '').trim()
    if (!descricao) continue

    if (rawCodigo) {
      current = {
        codigo: rawCodigo,
        descricao,
        unidade: 'unidade'  in cols ? String(row[cols.unidade]  ?? '').trim() : '',
        base:    'base'     in cols ? String(row[cols.base]     ?? '').trim() || null : null,
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
        grupo:    'grupo'    in cols ? String(row[cols.grupo]    ?? '').trim() || null : null,
        base:     'base'     in cols ? String(row[cols.base]     ?? '').trim() || null : null,
        data_ref: 'data_ref' in cols ? String(row[cols.data_ref] ?? '').trim() || null : null,
      })
    }
  }
  return { rows, erros }
}

// ─── Parser insumos flat ──────────────────────────────────────────────────────
function parseFlat(data: unknown[][]): { rows: ImportInsumoRow[]; erros: string[] } {
  const erros: string[] = []
  if (data.length < 2) return { rows: [], erros: ['Planilha vazia.'] }
  const header = (data[0] as unknown[]).map(String)
  const cols = detectCols(header)
  if (!('descricao' in cols)) {
    return { rows: [], erros: ['Coluna "descricao" não encontrada no cabeçalho.'] }
  }
  const rows: ImportInsumoRow[] = []
  for (let i = 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const descricao = String(row[cols.descricao] ?? '').trim()
    if (!descricao) continue
    rows.push({
      codigo:   'codigo'   in cols ? String(row[cols.codigo]   ?? '').trim() : '',
      descricao,
      unidade:  'unidade'  in cols ? String(row[cols.unidade]  ?? '').trim() : '',
      custo:    'custo'    in cols ? parseNumber(row[cols.custo])              : 0,
      grupo:    'grupo'    in cols ? String(row[cols.grupo]    ?? '').trim() || null : null,
      base:     'base'     in cols ? String(row[cols.base]     ?? '').trim() || null : null,
      data_ref: 'data_ref' in cols ? String(row[cols.data_ref] ?? '').trim() || null : null,
    })
  }
  return { rows, erros }
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
  const [preview, setPreview] = useState<ImportInsumoRow[] | null>(null)
  const [parseErros, setParseErros] = useState<string[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)

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
    processSheet(wb, names[0])
  }

  function processSheet(wb: unknown, name: string) {
    const XLSX = (window as any).__XLSX__ // already loaded; use dynamic version
    // Re-parse with the selected sheet
    const _wb = wb as { Sheets: Record<string, unknown>; SheetNames: string[] }
    const ws = _wb.Sheets[name]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const XLSX2 = (globalThis as any).__xlsx_module__
    if (!ws) return

    // Use sheetjs utils directly from module – we import dynamically at load time
    void import('xlsx').then(XLSX => {
      const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
      const { rows, erros } = parseFlat(data)
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
      const res = await importarInsumos(orcamentoId, preview)
      setResult(res); setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
      setSheets([]); setWbRef(null)
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-2">Planilha <strong>.xlsx</strong> — cada linha = um insumo</p>
        <p className="text-xs text-gray-400 mb-4">Colunas: <em>codigo, descricao, unidade, custo, grupo, base, data_ref</em></p>
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
  const [format, setFormat] = useState<'sudecap' | 'simples'>('simples')
  const [preview, setPreview] = useState<ImportComposicaoRow[] | null>(null)
  const [parseErros, setParseErros] = useState<string[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)

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
    processSheet(wb, names[0])
  }

  function processSheet(wb: unknown, name: string) {
    void import('xlsx').then(XLSX => {
      const _wb = wb as { Sheets: Record<string, unknown>; SheetNames: string[] }
      const ws = _wb.Sheets[name]
      if (!ws) return
      const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
      if (data.length < 2) { setPreview([]); return }
      const header = (data[0] as unknown[]).map(String)
      const detected = isSudecap(header) ? 'sudecap' : 'simples'
      setFormat(detected)
      const { rows, erros } = detected === 'sudecap' ? parseSudecap(data) : parseSimples(data)
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
      const res = await importarComposicoes(orcamentoId, preview)
      setResult(res); setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
      setSheets([]); setWbRef(null)
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally { setLoading(false) }
  }

  const totalInsumos = preview?.reduce((s, c) => s + c.insumos.length, 0) ?? 0

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-2">
          Planilha <strong>.xlsx</strong> hierárquica — composições + insumos
        </p>
        <p className="text-xs text-gray-400 mb-4">
          Detecta automaticamente o formato SUDECAP/SINAPI (colunas separadas para insumos) ou formato simples
          (linha com código = composição, linha sem código = insumo filho).
        </p>
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
                  <>
                    <tr key={`c-${ci}`} className="bg-blue-50">
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
                      <tr key={`more-${ci}`}>
                        <td colSpan={5} className="px-3 py-1 text-xs text-gray-400 pl-10 italic">
                          ...e mais {comp.insumos.length - 5} insumo(s)
                        </td>
                      </tr>
                    )}
                  </>
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

// ─── Form principal com abas ──────────────────────────────────────────────────

type Tab = 'insumos' | 'composicoes'

export function ImportForm({ orcamentoId }: { orcamentoId: string }) {
  const [tab, setTab] = useState<Tab>('composicoes')

  return (
    <div className="space-y-0">
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {([
          { key: 'composicoes', label: 'Importar Composições' },
          { key: 'insumos',     label: 'Importar Insumos Avulsos' },
        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'composicoes' && <ImportarComposicoesTab orcamentoId={orcamentoId} />}
      {tab === 'insumos'     && <ImportarInsumosTab     orcamentoId={orcamentoId} />}
    </div>
  )
}
