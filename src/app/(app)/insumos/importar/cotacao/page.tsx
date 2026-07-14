'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { registrarHistorico } from '@/lib/log'
import { PageHeader } from '@/components/ui/toolbar'
import { Button } from '@/components/ui/button'
import { StatRow, StatCard } from '@/components/ui/stat-row'
import { ImportResultBox } from '@/components/import-result-box'
import { WizardSteps } from '@/components/ui/import-wizard'

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'upload' | 'mapping' | 'preview' | 'result'

const WIZARD_STEPS = [
  { key: 'upload', label: 'Arquivo' },
  { key: 'mapping', label: 'Colunas' },
  { key: 'preview', label: 'Revisão' },
  { key: 'result', label: 'Resultado' },
]

type RawData = {
  headers: string[]
  rows: string[][]
}

type ColumnMapping = {
  codigoCol: number
  precoCol: number
  dataCol: number | null
}

type ParsedRow = {
  codigo: string
  preco_novo: number
  data_cotacao: string | null
}

type CompareRow = ParsedRow & {
  insumo_id: string | undefined
  descricao: string | undefined
  preco_atual: number | undefined
  status: 'changed' | 'no_change' | 'not_found'
}

type ImportResult = {
  atualizados: number
  sem_alteracao: number
  nao_encontrados: string[]
  erros: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COL_ALIASES: Record<string, string[]> = {
  codigo: ['cod', 'codigo', 'código', 'cód', 'code', 'codinsumo', 'cod_insumo', 'coditem'],
  preco:  ['preco', 'preço', 'preco_base', 'preço_base', 'custo', 'valor', 'r$', 'preco_unit',
           'preçounit', 'custo unit', 'custounitario', 'r$ unit', 'runit', 'price'],
  data:   ['data', 'data_cotacao', 'data_referencia', 'dataref', 'data ref', 'datareferencia',
           'mesano', 'mes/ano', 'competencia'],
}

function normKey(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
}

function autoDetect(headers: string[]): ColumnMapping {
  const found: Record<string, number> = {}
  headers.forEach((h, i) => {
    const n = normKey(h)
    for (const [field, aliases] of Object.entries(COL_ALIASES)) {
      if (!(field in found) && aliases.map(normKey).includes(n)) found[field] = i
    }
  })
  return {
    codigoCol: found.codigo ?? 0,
    precoCol:  found.preco  ?? 1,
    dataCol:   found.data   != null ? found.data : null,
  }
}

function parsePreco(raw: string): number {
  const s = raw.trim().replace(/[R$\s'"]/g, '')
  if (!s) return NaN
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.'))
  return parseFloat(s)
}

function parseData(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/')
    return `${y}-${m}-${d}`
  }
  const n = Number(s)
  if (!isNaN(n) && n > 25569 && n < 73050) {
    const dt = new Date((n - 25569) * 86400000)
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
  }
  return null
}

async function readFileAsRaw(file: File): Promise<RawData> {
  const buffer = await file.arrayBuffer()
  const name = file.name.toLowerCase()

  let csv: string
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    csv = XLSX.utils.sheet_to_csv(sheet, { FS: ';' })
  } else {
    const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    csv = utf8.includes('�') ? new TextDecoder('windows-1252').decode(buffer) : utf8
    csv = csv.replace(/^﻿/, '')
  }

  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return { headers: [], rows: [] }

  const delim = lines[0].includes(';') ? ';' : ','
  const split = (l: string) => l.split(delim).map(c => c.trim().replace(/^"|"$/g, ''))

  const headers = split(lines[0])
  const rows = lines.slice(1).map(split)
  return { headers, rows }
}

function applyMapping(rawData: RawData, mapping: ColumnMapping): ParsedRow[] {
  return rawData.rows.flatMap(row => {
    const codigo = (row[mapping.codigoCol] ?? '').trim()
    const precoRaw = (row[mapping.precoCol] ?? '').trim()
    const preco_novo = parsePreco(precoRaw)
    if (!codigo || isNaN(preco_novo) || preco_novo < 0) return []
    const data_cotacao = mapping.dataCol != null ? parseData(row[mapping.dataCol] ?? '') : null
    return [{ codigo, preco_novo, data_cotacao }]
  })
}

async function comparar(parsed: ParsedRow[]): Promise<CompareRow[]> {
  const sb = createClient() as any
  const codigos = parsed.map(r => r.codigo)
  const found = new Map<string, { id: string; descricao: string; preco_base: number }>()

  for (let i = 0; i < codigos.length; i += 500) {
    const { data } = await sb
      .from('tabela_insumos')
      .select('id, codigo, descricao, preco_base')
      .in('codigo', codigos.slice(i, i + 500))
    for (const ins of data ?? []) found.set(ins.codigo, ins)
  }

  return parsed.map(r => {
    const ins = found.get(r.codigo)
    if (!ins) return { ...r, insumo_id: undefined, descricao: undefined, preco_atual: undefined, status: 'not_found' as const }
    const changed = Math.abs(ins.preco_base - r.preco_novo) > 0.00005
    return {
      ...r,
      insumo_id: ins.id,
      descricao: ins.descricao,
      preco_atual: ins.preco_base,
      status: changed ? 'changed' as const : 'no_change' as const,
    }
  })
}

async function confirmar(rows: CompareRow[], userEmail: string): Promise<ImportResult> {
  const sb = createClient() as any
  const toUpdate = rows.filter(r => r.status === 'changed')
  const nao_encontrados = rows.filter(r => r.status === 'not_found').map(r => r.codigo)
  let atualizados = 0
  let erros = 0

  for (let i = 0; i < toUpdate.length; i += 100) {
    const batch = toUpdate.slice(i, i + 100)

    const updates = batch.map(r =>
      sb.from('tabela_insumos')
        .update({
          preco_base: r.preco_novo,
          ...(r.data_cotacao ? { data_referencia: r.data_cotacao } : {}),
        })
        .eq('id', r.insumo_id!)
    )
    const results = await Promise.all(updates)
    const batchErros = results.filter((res: { error: unknown }) => res.error).length
    atualizados += batch.length - batchErros
    erros += batchErros

    const histRecords = batch
      .filter((_r, idx) => !(results[idx] as { error: unknown }).error)
      .map(r => ({
        insumo_id:      r.insumo_id!,
        preco_anterior: r.preco_atual!,
        preco_novo:     r.preco_novo,
        origem:         'cotacao',
        usuario:        userEmail,
      }))
    if (histRecords.length > 0) {
      await sb.from('tabela_historico_precos').insert(histRecords)
    }
  }

  await registrarHistorico(sb, {
    entidade: 'insumo',
    tipo: 'sucesso',
    acao: 'importar_cotacao',
    mensagem: `Importação de Cotação: ${atualizados} preços atualizados.${nao_encontrados.length > 0 ? ` ${nao_encontrados.length} insumos não encontrados.` : ''}`,
    detalhes: { atualizados, sem_alteracao: rows.filter(r => r.status === 'no_change').length, nao_encontrados: nao_encontrados.length, erros },
  })

  return { atualizados, sem_alteracao: rows.filter(r => r.status === 'no_change').length, nao_encontrados, erros }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportarCotacaoPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [rawData, setRawData] = useState<RawData | null>(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [mapping, setMapping] = useState<ColumnMapping>({ codigoCol: 0, precoCol: 1, dataCol: null })
  const [compareRows, setCompareRows] = useState<CompareRow[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [showNotFound, setShowNotFound] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setGlobalError(null)
    try {
      const data = await readFileAsRaw(file)
      if (data.headers.length === 0) { setGlobalError('Arquivo sem colunas detectadas.'); return }
      setNomeArquivo(file.name)
      setRawData(data)
      setMapping(autoDetect(data.headers))
      setStep('mapping')
    } catch {
      setGlobalError('Erro ao ler o arquivo. Verifique se é XLSX, CSV ou TXT válido.')
    }
  }

  async function handleAnalisar() {
    if (!rawData) return
    setLoading(true)
    setGlobalError(null)
    try {
      const parsed = applyMapping(rawData, mapping)
      if (parsed.length === 0) { setGlobalError('Nenhuma linha válida com código e preço encontrada.'); setLoading(false); return }
      const rows = await comparar(parsed)
      setCompareRows(rows)
      setStep('preview')
    } catch {
      setGlobalError('Erro ao comparar com a base. Verifique a conexão.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmar() {
    setLoading(true)
    setGlobalError(null)
    try {
      const sb = createClient() as any
      const { data: { user } } = await sb.auth.getUser()
      const userEmail = user?.email ?? 'desconhecido'

      await registrarHistorico(sb, {
        entidade: 'insumo',
        tipo: 'info',
        acao: 'importar_cotacao',
        mensagem: 'Importação de Cotação iniciada.',
        detalhes: { total: compareRows.length, para_atualizar: compareRows.filter(r => r.status === 'changed').length },
      })

      const res = await confirmar(compareRows, userEmail)
      setResult(res)
      setStep('result')
    } catch {
      setGlobalError('Erro ao confirmar atualização. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setStep('upload')
    setRawData(null)
    setNomeArquivo('')
    setCompareRows([])
    setResult(null)
    setGlobalError(null)
    setShowNotFound(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const changed    = compareRows.filter(r => r.status === 'changed')
  const noChange   = compareRows.filter(r => r.status === 'no_change')
  const notFound   = compareRows.filter(r => r.status === 'not_found')

  return (
    <div className="max-w-5xl space-y-6">

      {/* Header */}
      <div>
        <Link href="/insumos/importar" className="text-sm text-primary-700 hover:underline">
          ← Importar insumos
        </Link>
        <div className="mt-2">
          <PageHeader
            title="Importar Cotação de Preços"
            description="Importe uma planilha de cotação para atualizar os preços dos insumos em massa."
          />
        </div>
      </div>

      <WizardSteps steps={WIZARD_STEPS} currentKey={step} />

      {globalError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {globalError}
        </div>
      )}

      {/* ── Step 1: Upload ── */}
      {step === 'upload' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
          <div className="space-y-2">
            <h2 className="font-semibold text-gray-900">Selecionar arquivo</h2>
            <p className="text-sm text-gray-500">Aceita XLSX, XLS, CSV e TXT.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            onChange={handleFile}
            className="block text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded-md file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 cursor-pointer"
          />
          <div className="rounded-lg border border-secondary-100 bg-secondary-50 p-4 space-y-1.5">
            <p className="text-sm font-medium text-secondary-900">Formato da planilha</p>
            <p className="text-sm text-secondary-800">
              A planilha deve ter pelo menos duas colunas: <strong>Código do insumo</strong> e <strong>Preço</strong>.
              A data de cotação é opcional. Os nomes das colunas são detectados automaticamente.
            </p>
            <p className="text-xs text-secondary-700 font-mono bg-secondary-100 rounded px-2 py-1 mt-1">
              CÓDIGO | PREÇO UNIT | DATA
            </p>
          </div>
        </div>
      )}

      {/* ── Step 2: Column Mapping ── */}
      {step === 'mapping' && rawData && (
        <div className="space-y-5">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-5">
            <div>
              <h2 className="font-semibold text-gray-900">Mapeamento de colunas</h2>
              <p className="text-sm text-gray-500 mt-0.5">Arquivo: <span className="font-mono">{nomeArquivo}</span> · {rawData.rows.length} linhas detectadas</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Coluna — Código <span className="text-red-500">*</span>
                </label>
                <select
                  value={mapping.codigoCol}
                  onChange={e => setMapping(m => ({ ...m, codigoCol: Number(e.target.value) }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                >
                  {rawData.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Coluna — Preço <span className="text-red-500">*</span>
                </label>
                <select
                  value={mapping.precoCol}
                  onChange={e => setMapping(m => ({ ...m, precoCol: Number(e.target.value) }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                >
                  {rawData.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gray-700">
                  Coluna — Data <span className="text-gray-400">(opcional)</span>
                </label>
                <select
                  value={mapping.dataCol ?? ''}
                  onChange={e => setMapping(m => ({ ...m, dataCol: e.target.value === '' ? null : Number(e.target.value) }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                >
                  <option value="">— nenhuma —</option>
                  {rawData.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Preview table */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
              <p className="text-sm font-medium text-gray-700">Prévia — primeiras 5 linhas</p>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    {rawData.headers.map((h, i) => (
                      <th key={i} className={`px-3 py-2 text-left font-medium ${
                        i === mapping.codigoCol ? 'text-primary-700 bg-primary-50' :
                        i === mapping.precoCol  ? 'text-emerald-700 bg-emerald-50' :
                        mapping.dataCol != null && i === mapping.dataCol ? 'text-amber-700 bg-amber-50' :
                        'text-gray-500'
                      }`}>
                        {h || `Col ${i + 1}`}
                        {i === mapping.codigoCol && <span className="ml-1 text-primary-500">(código)</span>}
                        {i === mapping.precoCol  && <span className="ml-1 text-emerald-500">(preço)</span>}
                        {mapping.dataCol != null && i === mapping.dataCol && <span className="ml-1 text-amber-500">(data)</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rawData.rows.slice(0, 5).map((row, ri) => (
                    <tr key={ri} className="hover:bg-gray-50">
                      {rawData.headers.map((_, ci) => (
                        <td key={ci} className={`px-3 py-1.5 ${
                          ci === mapping.codigoCol ? 'font-mono font-medium text-gray-900' :
                          ci === mapping.precoCol  ? 'text-gray-800' : 'text-gray-500'
                        }`}>
                          {row[ci] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleAnalisar} loading={loading}>
              Analisar e comparar
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 3: Preview ── */}
      {step === 'preview' && (
        <div className="space-y-5">
          {/* Stats */}
          <StatRow>
            <StatCard label="Encontrados" value={(compareRows.length - notFound.length).toLocaleString('pt-BR')} />
            <StatCard label="Atualizados" value={changed.length.toLocaleString('pt-BR')} />
            <StatCard label="Sem alteração" value={noChange.length.toLocaleString('pt-BR')} />
            <StatCard label="Não encontrados" value={notFound.length.toLocaleString('pt-BR')} />
          </StatRow>

          {/* Changed rows preview */}
          {changed.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  Insumos que serão atualizados
                  {changed.length > 50 && <span className="text-gray-400 ml-1">(exibindo 50 de {changed.length.toLocaleString('pt-BR')})</span>}
                </p>
              </div>
              <div className="overflow-auto max-h-96">
                <table className="w-full text-xs">
                  <thead className="border-b border-gray-200 bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600 w-28">Código</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Descrição</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 w-32">Preço atual</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 w-32">Preço novo</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600 w-24">Variação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {changed.slice(0, 50).map(r => {
                      const diff = r.preco_novo - r.preco_atual!
                      const pct = r.preco_atual! > 0 ? (diff / r.preco_atual!) * 100 : 0
                      return (
                        <tr key={r.codigo} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 font-mono text-gray-700">{r.codigo}</td>
                          <td className="px-3 py-1.5 text-gray-800 max-w-xs truncate">{r.descricao}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                            {r.preco_atual!.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium text-gray-900">
                            {r.preco_novo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </td>
                          <td className={`px-3 py-1.5 text-right tabular-nums text-xs font-medium ${diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {diff > 0 ? '+' : ''}{pct.toFixed(1)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Not found list */}
          {notFound.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden">
              <button
                onClick={() => setShowNotFound(v => !v)}
                className="w-full px-4 py-3 flex items-center justify-between text-left"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-amber-800">
                  <AlertTriangle size={14} /> {notFound.length} insumo{notFound.length !== 1 ? 's' : ''} não encontrado{notFound.length !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-amber-600">{showNotFound ? 'ocultar' : 'ver códigos'}</span>
              </button>
              {showNotFound && (
                <div className="px-4 pb-3 border-t border-amber-200">
                  <p className="text-xs text-amber-700 font-mono mt-2 break-all">
                    {notFound.map(r => r.codigo).join(', ')}
                  </p>
                </div>
              )}
            </div>
          )}

          {changed.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              Nenhum preço divergente encontrado. A planilha não traz alterações para aplicar.
            </div>
          )}

          <div className="flex gap-3">
            {changed.length > 0 && (
              <Button onClick={handleConfirmar} loading={loading}>
                Confirmar atualização de {changed.length.toLocaleString('pt-BR')} insumo{changed.length !== 1 ? 's' : ''}
              </Button>
            )}
            <Button variant="outline" onClick={handleReset}>
              {changed.length === 0 ? 'Fechar' : 'Cancelar'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 4: Result ── */}
      {step === 'result' && result && (
        <div className="space-y-5">
          <ImportResultBox variant="success" title="Importação concluída com sucesso!">
            <ul className="space-y-0.5">
              <li>✔ {result.atualizados.toLocaleString('pt-BR')} preço{result.atualizados !== 1 ? 's' : ''} atualizado{result.atualizados !== 1 ? 's' : ''}</li>
              {result.sem_alteracao > 0 && <li className="text-gray-500">— {result.sem_alteracao.toLocaleString('pt-BR')} sem alteração</li>}
              {result.nao_encontrados.length > 0 && (
                <li className="text-amber-700">⚠ {result.nao_encontrados.length} código{result.nao_encontrados.length !== 1 ? 's' : ''} não encontrado{result.nao_encontrados.length !== 1 ? 's' : ''}</li>
              )}
              {result.erros > 0 && <li className="text-red-700">✗ {result.erros} erro{result.erros !== 1 ? 's' : ''} ao salvar</li>}
            </ul>
          </ImportResultBox>

          {/* Recalcular section */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
            <h2 className="font-semibold text-gray-900">Recalcular</h2>
            <p className="text-sm text-gray-500">
              Os preços dos insumos foram atualizados. As composições e orçamentos que usam estes insumos podem precisar ser recalculados.
            </p>
            <div className="flex gap-3">
              <Link href="/composicoes">
                <Button variant="outline" size="sm">Ver Composições</Button>
              </Link>
              <Link href="/orcamentos">
                <Button variant="outline" size="sm">Ver Orçamentos</Button>
              </Link>
            </div>
          </div>

          <div className="flex gap-3">
            <Link href="/insumos">
              <Button>Ver insumos</Button>
            </Link>
            <Button variant="outline" onClick={handleReset}>
              Nova importação
            </Button>
          </div>
        </div>
      )}

    </div>
  )
}
