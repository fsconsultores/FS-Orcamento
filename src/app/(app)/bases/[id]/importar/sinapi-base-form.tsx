'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ImportInsumoRow, ImportComposicaoRow, ImportResult } from '@/app/(app)/orcamentos/[id]/importar/import-action'

// ─── Parsing utilities ────────────────────────────────────────────────────────

const COL_ALIASES: Record<string, string[]> = {
  codigo:      ['cod', 'codigo', 'code', 'codigodacomposicao', 'coddacomposicao'],
  codigo_item: ['codigodoitem', 'coddoitem', 'codigoitem', 'coditem', 'codigodoinsumo', 'codigodoservico'],
  descricao:   ['descricao', 'descr', 'description', 'nome', 'name', 'descricaoabreviada', 'descricaodoinsumo', 'descricaodacomposicao', 'descricaodoservico'],
  unidade:     ['unidade', 'und', 'un', 'unit', 'unidadedemedida', 'unid', 'unidadedacomposicao'],
  custo:       ['custo', 'preco', 'price', 'valor', 'custounit', 'custounitario', 'runit', 'mediana',
                'medianadesonerado', 'medianadesonerada', 'precomediano', 'precomedianodesonerado',
                'custounitariodesonerado', 'precototal'],
  indice:      ['indice', 'coeficiente', 'coef', 'coefutil', 'coeficienteutil', 'qtd', 'quantidade', 'qt', 'qtde'],
  grupo:       ['grupo', 'grupois', 'grupoinsumo', 'grupodoinsumo', 'group', 'categoria'],
  base:        ['base', 'fonte', 'cotacao', 'source', 'fornecedor'],
  data_ref:    ['dataref', 'datareferencia', 'datadereferencia', 'ref'],
}

function normCol(s: string): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/[^a-z0-9]/g, '')
}

function detectCols(header: string[]): Record<string, number> {
  const map: Record<string, number> = {}
  const cache: Record<string, string[]> = {}
  for (const [field, aliases] of Object.entries(COL_ALIASES)) cache[field] = aliases.map(normCol)
  header.forEach((h, i) => {
    const lower = normCol(h)
    for (const [field, norms] of Object.entries(cache)) {
      if (norms.includes(lower) && !(field in map)) map[field] = i
    }
  })
  return map
}

function findHeaderRow(data: unknown[][]): number {
  let bestRow = 0, bestScore = 0
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const score = Object.keys(detectCols((data[i] as unknown[]).map(String))).length
    if (score > bestScore) { bestScore = score; bestRow = i }
  }
  return bestRow
}

function parseNumber(val: unknown): number {
  if (typeof val === 'number') return val
  const s = String(val ?? '').replace(',', '.').replace(/[^\d.-]/g, '')
  return parseFloat(s) || 0
}

function isSudecap(header: string[]): boolean {
  const joined = header.join('|').toLowerCase()
  return joined.includes('tipoitem') || joined.includes('insumo/composicao') || joined.includes('insumocomposicao')
    || joined.includes('origemcomposicao') || joined.includes('producaoequipe')
}

// Flat insumos (IS*, IS GESTOR, etc.)
function parseFlat(data: unknown[][]): { rows: ImportInsumoRow[]; erros: string[] } {
  const erros: string[] = []
  if (data.length < 2) return { rows: [], erros: ['Planilha vazia.'] }
  const headerIdx = findHeaderRow(data)
  const cols = detectCols((data[headerIdx] as unknown[]).map(String))
  if (!('descricao' in cols)) return { rows: [], erros: ['Coluna "descricao" não encontrada.'] }
  // Formato analítico SINAPI detectado na aba de insumos
  if ('codigo' in cols && 'codigo_item' in cols && 'indice' in cols)
    return { rows: [], erros: ['Esta aba parece ser analítica (tem "Código da Composição" e "Código do Item"). Use-a na aba de Composições, não de Insumos.'] }
  const codigoCol = 'codigo' in cols ? 'codigo' : 'codigo_item' in cols ? 'codigo_item' : null
  const rows: ImportInsumoRow[] = []
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const descricao = String(row[cols.descricao] ?? '').trim()
    if (!descricao) continue
    rows.push({
      codigo:   codigoCol ? String(row[cols[codigoCol]] ?? '').trim() : '',
      descricao,
      unidade:  'unidade'  in cols ? String(row[cols.unidade]  ?? '').trim() : '',
      custo:    'custo'    in cols ? parseNumber(row[cols.custo]) : 0,
      indice:   1,
      grupo:    'grupo'    in cols ? String(row[cols.grupo]    ?? '').trim() || null : null,
      base:     'base'     in cols ? String(row[cols.base]     ?? '').trim() || null : null,
      data_ref: 'data_ref' in cols ? String(row[cols.data_ref] ?? '').trim() || null : null,
    })
  }
  return { rows, erros }
}

// Flat composições sem sub-itens (CS*)
function parseFlatComposicoes(data: unknown[][]): { rows: ImportComposicaoRow[]; erros: string[] } {
  const erros: string[] = []
  if (data.length < 2) return { rows: [], erros: ['Planilha vazia.'] }
  const headerIdx = findHeaderRow(data)
  const cols = detectCols((data[headerIdx] as unknown[]).map(String))
  if (!('descricao' in cols)) return { rows: [], erros: ['Coluna "descricao" não encontrada.'] }
  const rows: ImportComposicaoRow[] = []
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const descricao = String(row[cols.descricao] ?? '').trim()
    if (!descricao) continue
    rows.push({
      codigo:  'codigo'  in cols ? String(row[cols.codigo]  ?? '').trim() : '',
      descricao,
      unidade: 'unidade' in cols ? String(row[cols.unidade] ?? '').trim() : '',
      base: null, insumos: [],
    })
  }
  return { rows, erros }
}

// SUDECAP/CPU: colunas fixas (col 0=cod_comp, 1=desc_comp, 2=und_comp, 5=tipo, 6=cod_ins, 7=desc_ins, 8=und_ins, 9=indice, 10=grupo)
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
    const indice      = parseFloat(String(row[9] ?? '1').replace(',', '.')) || 1
    const grupo       = String(row[10] ?? '').trim() || null
    if (!codigoComp && !descComp && !descIns) continue
    if (codigoComp && descComp) {
      current = { codigo: codigoComp, descricao: descComp, unidade: unidadeComp, base: null, insumos: [] }
      rows.push(current)
    }
    if ((tipoItem === 'I' || tipoItem === 'C') && descIns && current) {
      current.insumos.push({ codigo: codigoIns, descricao: descIns, unidade: unidadeIns, custo: 0, indice, grupo, base: null, data_ref: null })
    }
  }
  return { rows, erros: [] }
}

// Analítico: detecta colunas.
// Formato SINAPI analítico: tem "Código da Composição" (codigo) E "Código do Item" (codigo_item).
//   Linha pai = codigo_item vazio; linha filho = codigo_item preenchido.
// Outros formatos hierárquicos: linha com codigo = pai, linha sem codigo = filho.
function parseAnalitico(data: unknown[][]): { rows: ImportComposicaoRow[]; erros: string[] } {
  const erros: string[] = []
  if (data.length < 2) return { rows: [], erros: ['Planilha vazia.'] }
  const headerIdx = findHeaderRow(data)
  const cols = detectCols((data[headerIdx] as unknown[]).map(String))
  if (!('descricao' in cols)) return { rows: [], erros: ['Coluna "descricao" não encontrada.'] }
  const rows: ImportComposicaoRow[] = []
  let current: ImportComposicaoRow | null = null
  const isSINAPI = 'codigo' in cols && 'codigo_item' in cols
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[]
    const descricao = String(row[cols.descricao] ?? '').trim()
    if (!descricao) continue
    const unidade = 'unidade' in cols ? String(row[cols.unidade] ?? '').trim() : ''
    if (isSINAPI) {
      const codigoComp = String(row[cols.codigo]      ?? '').trim()
      const codigoItem = String(row[cols.codigo_item] ?? '').trim()
      if (!codigoItem) {
        // linha pai: Código do Item vazio
        current = { codigo: codigoComp, descricao, unidade, base: null, insumos: [] }
        rows.push(current)
      } else if (current) {
        current.insumos.push({
          codigo:  codigoItem,
          descricao, unidade,
          custo:   'custo'  in cols ? parseNumber(row[cols.custo])  : 0,
          indice:  'indice' in cols ? parseNumber(row[cols.indice]) || 1 : 1,
          grupo:   'grupo'  in cols ? String(row[cols.grupo]  ?? '').trim() || null : null,
          base: null, data_ref: null,
        })
      }
    } else {
      const codigo = 'codigo' in cols ? String(row[cols.codigo] ?? '').trim() : ''
      if (codigo) {
        current = { codigo, descricao, unidade, base: null, insumos: [] }
        rows.push(current)
      } else if (current) {
        current.insumos.push({
          codigo:  '',
          descricao, unidade,
          custo:   'custo'  in cols ? parseNumber(row[cols.custo])  : 0,
          indice:  'indice' in cols ? parseNumber(row[cols.indice]) || 1 : 1,
          grupo:   'grupo'  in cols ? String(row[cols.grupo]  ?? '').trim() || null : null,
          base: null, data_ref: null,
        })
      }
    }
  }
  return { rows, erros }
}

// Detecta o melhor parser para uma aba de composições
function parseComposicoes(data: unknown[][]): { rows: ImportComposicaoRow[]; erros: string[]; fmt: string } {
  if (data.length < 2) return { rows: [], erros: ['Planilha vazia.'], fmt: 'vazio' }
  const headerIdx = findHeaderRow(data)
  const header = (data[headerIdx] as unknown[]).map(String)
  if (isSudecap(header)) return { ...parseSudecap(data), fmt: 'SUDECAP/CPU' }
  const cols = detectCols(header)
  if ('indice' in cols) {
    const fmt = ('codigo' in cols && 'codigo_item' in cols) ? 'Analítico SINAPI' : 'Analítico'
    return { ...parseAnalitico(data), fmt }
  }
  return { ...parseFlatComposicoes(data), fmt: 'Lista plana' }
}

// ─── Importação browser-side ───────────────────────────────────────────────────

async function importarInsumos(sb: any, baseId: string, rows: ImportInsumoRow[]): Promise<ImportResult> {
  const result: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [] }
  const allCodigos = rows.map(r => r.codigo).filter(Boolean)
  for (let i = 0; i < allCodigos.length; i += 500)
    await sb.from('tabela_insumos').delete().eq('base_id', baseId).in('codigo', allCodigos.slice(i, i + 500))
  const insRows = rows.map(r => ({ codigo: r.codigo, descricao: r.descricao, unidade: r.unidade, preco_base: r.custo, grupo: r.grupo, fonte: r.base, data_referencia: r.data_ref, base_id: baseId }))
  for (let i = 0; i < insRows.length; i += 500) {
    const { error } = await sb.from('tabela_insumos').insert(insRows.slice(i, i + 500))
    if (error) result.erros.push(`Lote ${i / 500 + 1}: ${error.message}`)
    else result.insumosCriados += Math.min(500, insRows.length - i)
  }
  return result
}

async function importarComposicoes(sb: any, baseId: string, rows: ImportComposicaoRow[]): Promise<ImportResult> {
  const result: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [] }
  const insumosPorCodigo = new Map<string, ImportInsumoRow>()
  for (const comp of rows)
    for (const ins of comp.insumos)
      if (ins.codigo && !insumosPorCodigo.has(ins.codigo)) insumosPorCodigo.set(ins.codigo, ins)
  const todosCodigos = [...insumosPorCodigo.keys()]
  const codeToId = new Map<string, string>()
  for (let i = 0; i < todosCodigos.length; i += 500) {
    const { data } = await sb.from('tabela_insumos').select('id, codigo').eq('base_id', baseId).in('codigo', todosCodigos.slice(i, i + 500))
    for (const ins of (data ?? []) as { id: string; codigo: string }[]) codeToId.set(ins.codigo, ins.id)
  }
  const ausentes = todosCodigos.filter(c => !codeToId.has(c))
  for (let i = 0; i < ausentes.length; i += 500) {
    const lote = ausentes.slice(i, i + 500).map(codigo => {
      const ins = insumosPorCodigo.get(codigo)!
      return { codigo, descricao: ins.descricao, unidade: ins.unidade, preco_base: ins.custo, grupo: ins.grupo, fonte: ins.base, data_referencia: ins.data_ref, base_id: baseId }
    })
    const { data, error } = await sb.from('tabela_insumos').insert(lote).select('id, codigo')
    if (error) { result.erros.push(`Insumos automáticos: ${error.message}`); break }
    for (const ins of (data ?? []) as { id: string; codigo: string }[]) { codeToId.set(ins.codigo, ins.id); result.insumosCriados++ }
  }
  const rowsMap = new Map<string, ImportComposicaoRow>()
  for (const r of rows) { if (!rowsMap.has(r.codigo)) rowsMap.set(r.codigo, r) }
  const rowsUniq = [...rowsMap.values()]
  const compCodeToId = new Map<string, string>()
  for (let i = 0; i < rowsUniq.length; i += 500) {
    const { data } = await sb.from('tabela_composicoes').select('id, codigo').eq('base_id', baseId).in('codigo', rowsUniq.slice(i, i + 500).map(r => r.codigo))
    for (const c of (data ?? []) as { id: string; codigo: string }[]) compCodeToId.set(c.codigo, c.id)
  }
  const novas = rowsUniq.filter(r => !compCodeToId.has(r.codigo))
  for (let i = 0; i < novas.length; i += 50) {
    const lote = novas.slice(i, i + 50)
    const { data, error } = await sb.from('tabela_composicoes').insert(lote.map(c => ({ codigo: c.codigo, descricao: c.descricao, unidade: c.unidade, base_id: baseId }))).select('id, codigo')
    if (error) { result.erros.push(`Composições: ${error.message}`); continue }
    for (const c of (data ?? []) as { id: string; codigo: string }[]) compCodeToId.set(c.codigo, c.id)
    result.composicoesCriadas += (data ?? []).length
  }
  // Apaga itens antigos de TODAS as composições importadas (novas e existentes) para reinserir
  const allCompIds = [...compCodeToId.values()]
  for (let i = 0; i < allCompIds.length; i += 500)
    await sb.from('tabela_itens_composicao').delete().in('composicao_id', allCompIds.slice(i, i + 500))
  // Insere itens para TODAS as composições (não só as novas)
  for (let i = 0; i < rowsUniq.length; i += 50) {
    const lote = rowsUniq.slice(i, i + 50)
    const itens = lote.flatMap(comp => {
      const compId = compCodeToId.get(comp.codigo)
      if (!compId) return []
      return comp.insumos.filter(ins => codeToId.has(ins.codigo)).map(ins => ({ composicao_id: compId, insumo_id: codeToId.get(ins.codigo)!, indice: ins.indice ?? 1 }))
    })
    if (itens.length > 0) {
      const { error } = await sb.from('tabela_itens_composicao').insert(itens)
      if (error) result.erros.push(`Itens: ${error.message}`)
    }
  }
  return result
}

// ─── UI ───────────────────────────────────────────────────────────────────────

function ResultBox({ result }: { result: ImportResult }) {
  const ok = result.erros.length === 0
  return (
    <div className={`rounded-lg border p-4 ${ok ? 'border-green-300 bg-green-50' : 'border-orange-300 bg-orange-50'}`}>
      <p className={`font-semibold text-sm mb-1 ${ok ? 'text-green-800' : 'text-orange-800'}`}>
        {ok ? 'Importação concluída!' : 'Importação com avisos'}
      </p>
      <p className="text-sm text-gray-700">
        {result.composicoesCriadas > 0 && <>{result.composicoesCriadas} composição(ões), </>}
        {result.insumosCriados} insumo(s) importados.
      </p>
      {result.erros.length > 0 && (
        <ul className="mt-2 text-xs text-orange-700 space-y-1">
          {result.erros.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
          {result.erros.length > 10 && <li>...e mais {result.erros.length - 10} avisos.</li>}
        </ul>
      )}
    </div>
  )
}

export function SINAPIBaseForm({ baseId, baseNome }: { baseId: string; baseNome: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [allSheets, setAllSheets] = useState<string[]>([])
  const [wbRef, setWbRef] = useState<unknown>(null)

  // Seleção de abas
  const [isSheet, setIsSheet] = useState('')   // aba de insumos
  const [csSheet, setCsSheet] = useState('')   // aba de composições

  const [previewCounts, setPreviewCounts] = useState<{ insumos: number; composicoes: number; fmt: string } | null>(null)
  const [parseErros, setParseErros] = useState<string[]>([])
  const [pendingData, setPendingData] = useState<{ insumos: ImportInsumoRow[]; composicoes: ImportComposicaoRow[] } | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null); setPreviewCounts(null); setParseErros([]); setPendingData(null)
    setFileName(file.name); setAllSheets([]); setIsSheet(''); setCsSheet('')
    const ab = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(ab, { type: 'array' })
    setWbRef(wb)
    const sheets = wb.SheetNames
    setAllSheets(sheets)

    // Auto-sugestão inteligente
    const upper = sheets.map(s => s.toUpperCase())
    const suggestIs = sheets.find((_, i) =>
      /^IS[A-Z]/.test(upper[i]) || upper[i].includes('INSUMO') || upper[i].includes('IS ') || upper[i] === 'IS'
    ) ?? ''
    const suggestCs = sheets.find((_, i) =>
      /^CS[A-Z]/.test(upper[i]) || upper[i].includes('CPU') || upper[i].includes('COMPOSICAO') ||
      upper[i].includes('COMPOSIÇÃO') || upper[i].includes('ANALITICO') || upper[i].includes('ANALÍTICO')
    ) ?? ''

    setIsSheet(suggestIs)
    setCsSheet(suggestCs)
  }

  function processPreview(newIsSheet: string, newCsSheet: string) {
    if (!wbRef || (!newIsSheet && !newCsSheet)) { setPendingData(null); setPreviewCounts(null); return }
    void import('xlsx').then(XLSX => {
      const _wb = wbRef as { Sheets: Record<string, unknown> }
      const erros: string[] = []
      let insumos: ImportInsumoRow[] = []
      let composicoes: ImportComposicaoRow[] = []
      let fmt = ''

      if (newIsSheet) {
        const ws = _wb.Sheets[newIsSheet]
        if (ws) {
          const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
          const r = parseFlat(data)
          insumos = r.rows
          erros.push(...r.erros.map(e => `[${newIsSheet}] ${e}`))
        }
      }

      if (newCsSheet) {
        const ws = _wb.Sheets[newCsSheet]
        if (ws) {
          const data = XLSX.utils.sheet_to_json(ws as any, { header: 1, defval: '' }) as unknown[][]
          const r = parseComposicoes(data)
          composicoes = r.rows
          fmt = r.fmt
          erros.push(...r.erros.map(e => `[${newCsSheet}] ${e}`))
        }
      }

      setPendingData({ insumos, composicoes })
      setPreviewCounts({ insumos: insumos.length, composicoes: composicoes.length, fmt })
      setParseErros(erros)
    })
  }

  function onIsSheetChange(v: string) { setIsSheet(v); processPreview(v, csSheet) }
  function onCsSheetChange(v: string) { setCsSheet(v); processPreview(isSheet, v) }

  async function handleImport() {
    if (!pendingData) return
    setLoading(true)
    const sb = createClient() as any
    const combined: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [] }
    try {
      if (pendingData.insumos.length > 0) {
        const r = await importarInsumos(sb, baseId, pendingData.insumos)
        combined.insumosCriados += r.insumosCriados
        combined.erros.push(...r.erros)
      }
      if (pendingData.composicoes.length > 0) {
        const r = await importarComposicoes(sb, baseId, pendingData.composicoes)
        combined.composicoesCriadas += r.composicoesCriadas
        combined.insumosCriados += r.insumosCriados
        combined.erros.push(...r.erros)
      }
      setResult(combined)
      setPendingData(null); setPreviewCounts(null)
      if (inputRef.current) inputRef.current.value = ''
      setWbRef(null); setAllSheets([]); setIsSheet(''); setCsSheet(''); setFileName('')
    } catch (err) {
      setResult({ composicoesCriadas: 0, insumosCriados: 0, erros: [String(err)] })
    } finally { setLoading(false) }
  }

  const sheetOptions = ['', ...allSheets]

  return (
    <div className="space-y-5">
      {/* Arquivo */}
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-1">Arquivo <strong>.xlsx</strong> — qualquer formato (SINAPI, SUDECAP, CPU, próprio)</p>
        <p className="text-xs text-gray-400 mb-4">Escolha abaixo quais abas contêm insumos e composições</p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.ods" onChange={handleFile}
          className="block mx-auto text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:text-sm file:font-medium hover:file:bg-blue-700 cursor-pointer" />
        {fileName && <p className="mt-2 text-xs text-gray-400">{fileName}</p>}
      </div>

      {/* Seleção de abas */}
      {allSheets.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aba de <span className="text-blue-600">insumos</span>
              <span className="ml-1 text-xs text-gray-400">(lista de materiais/mão de obra com preço)</span>
            </label>
            <select value={isSheet} onChange={e => onIsSheetChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
              {sheetOptions.map(s => <option key={s} value={s}>{s || '— nenhuma —'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Aba de <span className="text-purple-600">composições</span>
              <span className="ml-1 text-xs text-gray-400">(serviços com sub-itens/coeficientes)</span>
            </label>
            <select value={csSheet} onChange={e => onCsSheetChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30">
              {sheetOptions.map(s => <option key={s} value={s}>{s || '— nenhuma —'}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Avisos de parse */}
      {parseErros.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3">
          <p className="text-xs font-semibold text-yellow-800 mb-1">Avisos:</p>
          <ul className="text-xs text-yellow-700 space-y-0.5">
            {parseErros.slice(0, 5).map((e, i) => <li key={i}>• {e}</li>)}
          </ul>
          {parseErros.length > 5 && <p className="text-xs text-yellow-600 mt-1">...e mais {parseErros.length - 5} avisos.</p>}
        </div>
      )}

      {/* Preview + botão */}
      {previewCounts && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-800">Pronto para importar para <strong>{baseNome}</strong></p>
            <p className="text-xs text-gray-500 mt-0.5">
              {previewCounts.insumos > 0 && <span>{previewCounts.insumos.toLocaleString('pt-BR')} insumo(s)</span>}
              {previewCounts.insumos > 0 && previewCounts.composicoes > 0 && <span> · </span>}
              {previewCounts.composicoes > 0 && (
                <span>{previewCounts.composicoes.toLocaleString('pt-BR')} composição(ões)
                  {previewCounts.fmt && <span className="text-gray-400"> ({previewCounts.fmt})</span>}
                </span>
              )}
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
