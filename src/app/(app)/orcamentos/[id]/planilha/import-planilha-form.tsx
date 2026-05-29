'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { importarEstrutura } from './planilha-action'
import type { EstruturaRow, ImportResult } from './planilha-action'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseBrNumber(s: unknown): number {
  const c = String(s ?? '').replace(/R\$\s*/g, '').trim()
  if (!c || c === '-' || c === '') return 0
  if (typeof s === 'number') return s
  return parseFloat(c.replace(/\./g, '').replace(',', '.')) || 0
}

function normNum(n: string): string {
  return n.split('.').map(s => parseInt(s, 10).toString()).join('.')
}

function getLevel(norm: string): number {
  return norm.split('.').length
}

function isSkipRow(cols: string[]): boolean {
  const desc = (cols[2] ?? cols[1] ?? '').trim().toUpperCase()
  return (
    desc.startsWith('TOTAL ITEM') ||
    desc.startsWith('TOTAL DO ORÇAMENTO') ||
    desc.startsWith('CUSTO/M2') ||
    desc.startsWith('ÁREA COBERTA')
  )
}

function isHeaderRow(cols: string[]): boolean {
  const joined = cols.slice(0, 5).join(' ').toLowerCase()
  return joined.includes('item') && joined.includes('descri')
}

// Núcleo compartilhado: recebe matriz de células (qualquer formato) → EstruturaRow[]
function parseMatrix(matrix: unknown[][]): EstruturaRow[] {
  const rows: EstruturaRow[] = []
  let ordem = 0

  // Encontra linha de cabeçalho nas primeiras 15 linhas
  let startLine = 0
  for (let i = 0; i < Math.min(15, matrix.length); i++) {
    if (isHeaderRow(matrix[i].map(c => String(c ?? '')))) {
      startLine = i + 1
      break
    }
  }

  for (let i = startLine; i < matrix.length; i++) {
    const cols = matrix[i].map(c => String(c ?? '').trim())

    if (cols.every(c => !c)) continue

    const numero = cols[0] ?? ''
    if (!numero) continue
    if (isSkipRow(cols)) continue
    if (!/^[\d.]+$/.test(numero)) continue

    const norm = normNum(numero)
    const nivel = getLevel(norm)
    const codigo = cols[1] ? cols[1] : null
    const descricao = cols[2] ?? cols[1] ?? ''
    if (!descricao) continue

    const unidade = cols[3] ? cols[3] : null
    const quantidade = cols[4] ? parseBrNumber(matrix[i][4]) || null : null
    // Formato expandido (MAT;MO;TERCEIROS;PREÇO UNIT. em cols 5-8) vs simples (R$ UNIT. em col 5)
    const custoUnitario = matrix[i].length > 8
      ? parseBrNumber(matrix[i][8]) || null
      : (cols[5] ? parseBrNumber(matrix[i][5]) || null : null)

    const tipo: 'grupo' | 'item' = !codigo ? 'grupo' : 'item'

    rows.push({
      numero,
      nivel,
      codigo,
      descricao,
      unidade: tipo === 'grupo' ? null : unidade,
      quantidade: tipo === 'grupo' ? null : quantidade,
      custo_unitario: tipo === 'grupo' ? null : custoUnitario,
      tipo,
      ordem: ordem++,
    })
  }

  return rows
}

function parseCsv(text: string): EstruturaRow[] {
  const cleaned = text.replace(/^﻿/, '')
  const lines = cleaned.split(/\r?\n/)
  const matrix = lines.map(line =>
    line.split(';').map(c => c.trim().replace(/^"|"$/g, ''))
  )
  return parseMatrix(matrix)
}

async function parseXlsx(ab: ArrayBuffer): Promise<{ rows: EstruturaRow[]; sheets: string[] }> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(ab, { type: 'array', cellDates: false })
  const sheets = wb.SheetNames

  // Tenta cada aba até encontrar dados válidos
  for (const sheetName of sheets) {
    const ws = wb.Sheets[sheetName]
    if (!ws) continue
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
    const rows = parseMatrix(matrix)
    if (rows.length > 0) return { rows, sheets }
  }

  return { rows: [], sheets }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ImportPlanilhaForm({ orcamentoId }: { orcamentoId: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<EstruturaRow[] | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [errosParse, setErrosParse] = useState<string[]>([])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null); setErrosParse([])

    const ab = await file.arrayBuffer()
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

    let rows: EstruturaRow[] = []

    if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
      const parsed = await parseXlsx(ab)
      rows = parsed.rows
    } else {
      const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(ab)
      const text = utf8.includes('�')
        ? new TextDecoder('windows-1252').decode(ab)
        : utf8
      rows = parseCsv(text)
    }

    if (rows.length === 0) {
      setErrosParse(['Nenhum item encontrado. Verifique o formato do arquivo.'])
      setPreview(null)
    } else {
      setPreview(rows)
    }
  }

  async function handleImport() {
    if (!preview?.length) return
    setLoading(true)
    try {
      const res = await importarEstrutura(orcamentoId, preview)
      setPreview(null)
      setOpen(false)
      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
      setResult(res)
    } catch (err) {
      setResult({ ok: 0, erros: [String(err)] })
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        Importar Planilha
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Importar Planilha Orçamentária</h3>
        <button
          onClick={() => { setOpen(false); setPreview(null); setResult(null); setErrosParse([]) }}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="rounded-md bg-white border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
        <p className="font-medium text-gray-700">Formatos aceitos: <span className="font-mono">.xlsx</span>, <span className="font-mono">.xls</span>, <span className="font-mono">.csv</span></p>
        <p className="text-gray-500">Colunas esperadas (em qualquer ordem):</p>
        <p className="font-mono bg-gray-50 px-2 py-1 rounded">ITEM · CÓDIGO · DESCRIÇÃO · UND · QTDE · R$ UNIT.</p>
        <ul className="list-disc list-inside space-y-0.5 text-gray-500">
          <li>Linhas sem código = capítulos/grupos</li>
          <li>Numeração hierárquica: <span className="font-mono">1, 1.1, 1.1.1</span> etc.</li>
          <li>Suporta formato BR (R$ 1.800,00) e números diretos</li>
          <li>Para XLSX com múltiplas abas, usa a primeira aba com dados válidos</li>
        </ul>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.ods,.csv,.txt"
        onChange={handleFile}
        className="block text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:font-medium hover:file:bg-blue-700 cursor-pointer"
      />

      {errosParse.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {errosParse.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {preview && preview.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">{preview.length}</span> itens detectados
              {' · '}
              <span className="text-blue-700">{preview.filter(r => r.tipo === 'grupo').length} grupos</span>
              {' · '}
              <span className="text-gray-600">{preview.filter(r => r.tipo === 'item').length} itens</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => { setPreview(null); if (inputRef.current) inputRef.current.value = '' }}
                className="rounded border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Limpar
              </button>
              <button
                onClick={handleImport}
                disabled={loading}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Importando...' : 'Confirmar Importação'}
              </button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 text-left text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Und</th>
                  <th className="px-3 py-2 text-right">Qtde</th>
                  <th className="px-3 py-2 text-right">R$ Unit.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.slice(0, 100).map((r, i) => (
                  <tr key={i} className={r.tipo === 'grupo' ? 'bg-gray-50 font-medium' : ''}>
                    <td className="px-3 py-1.5 font-mono text-gray-500" style={{ paddingLeft: `${8 + (r.nivel - 1) * 16}px` }}>
                      {r.numero}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-gray-400">{r.codigo ?? '—'}</td>
                    <td className="px-3 py-1.5 text-gray-800 max-w-xs truncate">{r.descricao}</td>
                    <td className="px-3 py-1.5 text-gray-500">{r.unidade ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.quantidade?.toLocaleString('pt-BR') ?? '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.custo_unitario != null
                        ? r.custo_unitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 100 && (
              <p className="px-3 py-2 text-xs text-gray-400 text-center">
                Mostrando 100 de {preview.length} itens. Todos serão importados.
              </p>
            )}
          </div>
        </div>
      )}

      {result && (
        <div className={`rounded border p-3 text-sm ${result.erros.length === 0 ? 'border-green-200 bg-green-50 text-green-800' : 'border-orange-200 bg-orange-50 text-orange-800'}`}>
          {result.erros.length === 0
            ? `✓ ${result.ok} itens importados com sucesso.`
            : `${result.ok} importados · ${result.erros.length} erro(s): ${result.erros.slice(0, 2).join('; ')}`}
        </div>
      )}
    </div>
  )
}
