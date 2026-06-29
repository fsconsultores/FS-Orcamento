'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { logAction } from '@/lib/log'

// 27 states in SINAPI file order (columns 6–32)
const SINAPI_STATES = [
  { code: 'AC', name: 'Acre' },
  { code: 'AL', name: 'Alagoas' },
  { code: 'AM', name: 'Amazonas' },
  { code: 'AP', name: 'Amapá' },
  { code: 'BA', name: 'Bahia' },
  { code: 'CE', name: 'Ceará' },
  { code: 'DF', name: 'Distrito Federal' },
  { code: 'ES', name: 'Espírito Santo' },
  { code: 'GO', name: 'Goiás' },
  { code: 'MA', name: 'Maranhão' },
  { code: 'MG', name: 'Minas Gerais' },
  { code: 'MS', name: 'Mato Grosso do Sul' },
  { code: 'MT', name: 'Mato Grosso' },
  { code: 'PA', name: 'Pará' },
  { code: 'PB', name: 'Paraíba' },
  { code: 'PE', name: 'Pernambuco' },
  { code: 'PI', name: 'Piauí' },
  { code: 'PR', name: 'Paraná' },
  { code: 'RJ', name: 'Rio de Janeiro' },
  { code: 'RN', name: 'Rio Grande do Norte' },
  { code: 'RO', name: 'Rondônia' },
  { code: 'RR', name: 'Roraima' },
  { code: 'RS', name: 'Rio Grande do Sul' },
  { code: 'SC', name: 'Santa Catarina' },
  { code: 'SE', name: 'Sergipe' },
  { code: 'SP', name: 'São Paulo' },
  { code: 'TO', name: 'Tocantins' },
] as const

type StateCode = typeof SINAPI_STATES[number]['code']

type CatKey = 'MATERIAL' | 'MAO_DE_OBRA' | 'SERVICOS' | 'EQUIP_AQUISICAO' | 'EQUIP_LOCACAO' | 'ENCARGOS' | 'ESPECIAIS'

const CATEGORIAS: { key: CatKey; label: string; prefix: string; grupo: string }[] = [
  { key: 'MATERIAL',       label: 'Material',          prefix: 'MATERIAL',            grupo: 'MATERIAL'             },
  { key: 'MAO_DE_OBRA',    label: 'Mão de obra',       prefix: 'MAO DE OBRA',         grupo: 'MAO DE OBRA'          },
  { key: 'SERVICOS',       label: 'Serviços',           prefix: 'SERVICO',             grupo: 'SERVICOS'             },
  { key: 'EQUIP_AQUISICAO',label: 'Equip. aquisição',  prefix: 'EQUIPAMENTO (AQUI',   grupo: 'EQUIPAMENTO AQUISICAO'},
  { key: 'EQUIP_LOCACAO',  label: 'Equip. locação',    prefix: 'EQUIPAMENTO (LOC',    grupo: 'EQUIPAMENTO LOCACAO'  },
  { key: 'ENCARGOS',       label: 'Encargos',           prefix: 'ENCARGO',             grupo: 'ENCARGOS COMPLEMENTARES'},
  { key: 'ESPECIAIS',      label: 'Especiais',          prefix: 'ESPECIAI',            grupo: 'ESPECIAIS'            },
]

type RowParsed = {
  linha: number
  codigo: string
  descricao: string
  unidade: string
  preco: number
  catKey: CatKey
}

type ImportResult = {
  atualizados: number
  inseridos: number
  semPreco: number
  erros: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Use explicit Unicode escape to avoid invisible-character encoding issues
function normUp(s: string): string {
  return s.trim().toUpperCase()
    .normalize('NFD')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, '')
    .replace(/['"]/g, '') // strip stray quotes from CSV cells
}

function parsePreco(raw: string): number {
  if (!raw || !raw.trim()) return 0
  const s = raw.trim().replace(/['"]/g, '')
  if (s.includes(',')) {
    // Brazilian format: 1.234,56 → remove dot-thousands, replace comma
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(s) || 0
}

async function readFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const name = file.name.toLowerCase()

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    // sheet_to_csv produces semicolon-delimited text with dot-decimal numbers
    return XLSX.utils.sheet_to_csv(sheet, { FS: ';' })
  }

  // CSV / TXT: try UTF-8 first, fall back to Windows-1252 on replacement chars
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  const text = utf8.includes('�')
    ? new TextDecoder('windows-1252').decode(buffer)
    : utf8
  // Strip BOM if present (CEF files often include UTF-8 BOM)
  return text.replace(/^﻿/, '')
}

function detectDate(text: string): string {
  const m = text.slice(0, 8000).match(/\b(0[1-9]|1[0-2])\/(\d{4})\b/)
  if (!m) return ''
  const year = parseInt(m[2])
  if (year < 2010 || year > 2040) return ''
  return `${m[2]}-${m[1]}`
}

function findStateCol(parsed: string[][], state: string): number {
  const allCodes = new Set<string>(SINAPI_STATES.map(s => s.code))
  for (const row of parsed.slice(0, 50)) {
    const idx = row.findIndex(c => c.trim().toUpperCase() === state)
    if (idx >= 5) {
      const matching = row.filter(c => allCodes.has(c.trim().toUpperCase())).length
      if (matching >= 10) return idx
    }
  }
  // Hard-coded fallback: AC=5, AL=6, …, TO=31
  const offset = SINAPI_STATES.findIndex(s => s.code === state)
  return offset >= 0 ? 5 + offset : -1
}

// Map of known category column values → CatKey (handle accent variants)
const CAT_PREFIXES: [string, CatKey][] = [
  ['MATERIAL',            'MATERIAL'],
  ['MAO DE OBRA',         'MAO_DE_OBRA'],
  ['SERVICO',             'SERVICOS'],
  ['EQUIPAMENTO (AQUI',   'EQUIP_AQUISICAO'],
  ['EQUIPAMENTO (LOC',    'EQUIP_LOCACAO'],
  ['ENCARGO',             'ENCARGOS'],
  ['ESPECIAI',            'ESPECIAIS'],
]

function detectCatKey(classif: string): CatKey | null {
  const n = normUp(classif)
  for (const [prefix, key] of CAT_PREFIXES) {
    if (n.startsWith(prefix)) return key
  }
  return null
}

// ─── Core parser ──────────────────────────────────────────────────────────────

function parseRows(
  text: string,
  state: StateCode,
  desoneracao: boolean,
  categoriasAtivas: Set<CatKey>,
  incluirZero: boolean,
): { rows: RowParsed[]; stateFound: boolean; debugInfo: string } {
  const lines = text.split(/\r?\n/)
  const parsed = lines.map(l => l.split(';').map(c => c.trim().replace(/^"|"$/g, '')))

  const stateCol = findStateCol(parsed, state)
  if (stateCol < 0) return { rows: [], stateFound: false, debugInfo: `Coluna do estado ${state} não encontrada` }

  const seen = new Map<string, RowParsed>()
  let skippedNoCat = 0
  let skippedOrigem = 0
  let skippedZero = 0

  for (let i = 0; i < parsed.length; i++) {
    const cols = parsed[i]
    if (cols.length <= stateCol) continue

    const catKey = detectCatKey(cols[0])
    if (!catKey) { skippedNoCat++; continue }
    if (categoriasAtivas.size > 0 && !categoriasAtivas.has(catKey)) continue

    // Filter by ORIGEM (NAO ONERADO = sem desoneração, ONERADO = com desoneração)
    const origem = normUp(cols[4] ?? '')
    if (origem === 'ONERADO' || origem === 'NAO ONERADO') {
      const target = desoneracao ? 'ONERADO' : 'NAO ONERADO'
      if (origem !== target) { skippedOrigem++; continue }
    }

    const codigo = cols[1]?.trim()
    const descricao = cols[2]?.trim()
    const unidade = cols[3]?.trim()
    if (!codigo || !descricao) continue

    const preco = parsePreco(cols[stateCol] ?? '')
    if (!incluirZero && preco === 0) { skippedZero++; continue }

    if (!seen.has(codigo)) {
      seen.set(codigo, { linha: i + 1, codigo, descricao, unidade, preco, catKey })
    }
  }

  const rows = Array.from(seen.values())
  const debugInfo = rows.length === 0
    ? `Coluna do estado: ${stateCol} · sem categoria: ${skippedNoCat} linhas · filtro origem: ${skippedOrigem} · sem preço: ${skippedZero} · Primeiros valores col[0]: ${parsed.slice(0, 10).map(r => r[0]).filter(Boolean).join(', ')}`
    : ''
  return { rows, stateFound: true, debugInfo }
}

// ─── Import ───────────────────────────────────────────────────────────────────

async function importarRows(
  rows: RowParsed[],
  mesAno: string,
  estado: StateCode,
  userEmail: string,
): Promise<ImportResult> {
  const sb = createClient() as any
  const { data: baseId, error: baseErr } = await sb.rpc('get_or_create_propria_base')
  if (baseErr) throw new Error('Não foi possível acessar sua base. Tente novamente.')

  const dataReferencia = mesAno ? `${mesAno}-01` : null
  const codigos = rows.map(r => r.codigo)
  const existentesMap = new Map<string, string>()
  const precosAtuaisMap = new Map<string, number>()

  for (let i = 0; i < codigos.length; i += 500) {
    const { data: exs } = await sb
      .from('tabela_insumos')
      .select('id, codigo, preco_base')
      .eq('base_id', baseId)
      .in('codigo', codigos.slice(i, i + 500))
    for (const e of (exs ?? []) as { id: string; codigo: string; preco_base: number }[]) {
      existentesMap.set(e.codigo, e.id)
      precosAtuaisMap.set(e.codigo, e.preco_base)
    }
  }

  await logAction(sb, {
    usuario: userEmail,
    tipo: 'info',
    acao: 'importar_sinapi',
    mensagem: 'Importação SINAPI iniciada.',
    contexto: { estado, total: rows.length, para_atualizar: codigos.filter(c => existentesMap.has(c)).length },
  })

  const aAtualizar = rows.filter(r => existentesMap.has(r.codigo))
  const aInserir   = rows.filter(r => !existentesMap.has(r.codigo))
  let atualizados = 0, inseridos = 0, semPreco = 0, erros = 0

  semPreco = rows.filter(r => r.preco === 0).length

  for (let i = 0; i < aAtualizar.length; i += 100) {
    const lote = aAtualizar.slice(i, i + 100).map(r => ({
      id:              existentesMap.get(r.codigo)!,
      preco_base:      r.preco,
      descricao:       r.descricao,
      unidade:         r.unidade,
      data_referencia: dataReferencia,
      base_origem:     'SINAPI',
    }))
    const { data, error } = await sb.from('tabela_insumos').upsert(lote, { onConflict: 'id' }).select('id')
    if (!error) {
      atualizados += (data ?? []).length
      const histRecords = aAtualizar.slice(i, i + 100)
        .filter(r => Math.abs((precosAtuaisMap.get(r.codigo) ?? 0) - r.preco) > 0.00005)
        .map(r => ({
          insumo_id:      existentesMap.get(r.codigo)!,
          preco_anterior: precosAtuaisMap.get(r.codigo) ?? null,
          preco_novo:     r.preco,
          origem:         'sinapi',
          usuario:        userEmail,
        }))
      if (histRecords.length > 0) {
        await sb.from('tabela_historico_precos').insert(histRecords)
      }
    } else {
      erros += lote.length
    }
  }

  for (let i = 0; i < aInserir.length; i += 100) {
    const cat = (key: CatKey) => CATEGORIAS.find(c => c.key === key)?.grupo ?? key
    const lote = aInserir.slice(i, i + 100).map(r => ({
      codigo:          r.codigo,
      descricao:       r.descricao,
      unidade:         r.unidade,
      preco_base:      r.preco,
      grupo:           cat(r.catKey),
      data_referencia: dataReferencia,
      base_id:         baseId,
      base_origem:     'SINAPI',
    }))
    const { data, error } = await sb.from('tabela_insumos').insert(lote).select('id')
    if (!error) inseridos += (data ?? []).length; else erros += lote.length
  }

  await logAction(sb, {
    usuario: userEmail,
    tipo: 'sucesso',
    acao: 'importar_sinapi',
    mensagem: `Importação SINAPI: ${atualizados} preços atualizados, ${inseridos} inseridos.`,
    contexto: { estado, atualizados, inseridos, semPreco, erros },
  })

  return { atualizados, inseridos, semPreco, erros }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ImportarSinapiPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fileText, setFileText]     = useState('')
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [mesAno, setMesAno]         = useState('')
  const [estado, setEstado]         = useState<StateCode>('MG')
  const [desoneracao, setDesoneracao] = useState(false)
  const [categoriasAtivas, setCategoriasAtivas] = useState<Set<CatKey>>(
    new Set(CATEGORIAS.map(c => c.key))
  )
  const [incluirZero, setIncluirZero] = useState(false)
  const [loading, setLoading]       = useState(false)
  const [resultado, setResultado]   = useState<ImportResult | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const { rows, stateFound, debugInfo } = fileText
    ? parseRows(fileText, estado, desoneracao, categoriasAtivas, incluirZero)
    : { rows: [], stateFound: false, debugInfo: '' }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setNomeArquivo(file.name)
    setResultado(null)
    setGlobalError(null)
    try {
      const text = await readFileAsText(file)
      setFileText(text)
      const detected = detectDate(text)
      if (detected) setMesAno(detected)
    } catch {
      setGlobalError('Erro ao ler o arquivo.')
    }
  }

  function toggleCategoria(key: CatKey) {
    setCategoriasAtivas(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size === 1) return prev
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  async function handleImportar() {
    if (rows.length === 0 || loading) return
    setLoading(true)
    setGlobalError(null)
    try {
      const sb = createClient() as any
      const { data: { user } } = await sb.auth.getUser()
      const userEmail = user?.email ?? 'desconhecido'
      const result = await importarRows(rows, mesAno, estado, userEmail)
      setResultado(result)
      setFileText('')
      setNomeArquivo('')
      if (fileRef.current) fileRef.current.value = ''
    } catch (err: unknown) {
      setGlobalError((err as { message?: string })?.message ?? 'Erro ao importar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-5xl space-y-6">

      <div>
        <Link href="/insumos/importar" className="text-sm text-blue-600 hover:underline">
          ← Importar insumos
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Importar tabela SINAPI</h1>
        <p className="mt-1 text-sm text-gray-500">
          Importa a planilha mensal de preços da CEF (CSV ou XLSX).
          Insumos já cadastrados têm o preço atualizado; novos são inseridos na sua base.
        </p>
      </div>

      {/* Instructions */}
      <div className="rounded-xl border bg-blue-50 border-blue-100 p-5 space-y-2">
        <h2 className="font-semibold text-blue-900">Como obter a tabela SINAPI</h2>
        <ol className="text-sm text-blue-800 list-decimal list-inside space-y-1">
          <li>Acesse o portal da CEF → Poder Público → SINAPI → Preços</li>
          <li>Baixe o arquivo <strong>Preços de Insumos com ou sem desoneração</strong> no formato CSV ou XLSX</li>
          <li>O arquivo contém preços para todos os estados em uma única planilha — selecione seu estado abaixo</li>
        </ol>
      </div>

      {/* Settings */}
      <div className="rounded-xl border bg-white p-5 shadow-sm space-y-5">
        <h2 className="font-semibold text-gray-900">Configurações</h2>

        {/* State */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Estado</label>
          <select
            value={estado}
            onChange={e => setEstado(e.target.value as StateCode)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            {SINAPI_STATES.map(s => (
              <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
            ))}
          </select>
        </div>

        {/* Desoneration */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Tipo de preço</label>
          <div className="flex gap-2">
            {[
              { label: 'Sem desoneração', val: false },
              { label: 'Com desoneração', val: true  },
            ].map(({ label, val }) => (
              <button
                key={label}
                type="button"
                onClick={() => setDesoneracao(val)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  desoneracao === val
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Month/year */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Mês/ano de referência</label>
          <input
            type="month"
            value={mesAno}
            onChange={e => setMesAno(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
          <p className="text-xs text-gray-400">Detectado automaticamente do conteúdo do arquivo. Pode ser ajustado.</p>
        </div>

        {/* Categories */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-gray-700">Categorias</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIAS.map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={() => toggleCategoria(cat.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  categoriasAtivas.has(cat.key)
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-400 border-gray-300 hover:border-gray-500'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Zero prices */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={incluirZero}
            onChange={e => setIncluirZero(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm text-gray-700">Incluir insumos sem preço para este estado</span>
        </label>
      </div>

      {/* File upload */}
      <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-900">Selecionar arquivo</h2>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,.xlsx,.xls"
          onChange={handleFile}
          className="block text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded-md file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 cursor-pointer"
        />
        {nomeArquivo && <p className="text-xs text-gray-500 font-mono">{nomeArquivo}</p>}
      </div>

      {/* State not found warning */}
      {fileText && !stateFound && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Não foi possível localizar a coluna do estado <strong>{estado}</strong> no arquivo.
          Verifique se é um arquivo CSV/XLSX do SINAPI com preços por estado.
        </p>
      )}

      {/* Debug: file loaded but 0 rows detected */}
      {fileText && stateFound && rows.length === 0 && debugInfo && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-amber-800">
            Arquivo lido, mas nenhum insumo foi detectado.
          </p>
          <p className="text-xs text-amber-700 font-mono break-all">{debugInfo}</p>
          <p className="text-xs text-amber-600">
            Verifique se o arquivo é o CSV de insumos do SINAPI (não o de composições) e se o separador é ponto-e-vírgula (;).
          </p>
        </div>
      )}

      {/* Preview table */}
      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-700">
                {rows.length.toLocaleString('pt-BR')} insumo{rows.length !== 1 ? 's' : ''} para importar
                {' · '}estado <strong>{estado}</strong>
                {' · '}{desoneracao ? 'com desoneração' : 'sem desoneração'}
              </p>
              {mesAno && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Ref.: {new Date(`${mesAno}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </p>
              )}
            </div>
            <button
              onClick={handleImportar}
              disabled={loading}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading
                ? 'Importando…'
                : `Importar ${rows.length.toLocaleString('pt-BR')} insumo${rows.length !== 1 ? 's' : ''}`}
            </button>
          </div>

          <div className="overflow-auto rounded-xl border bg-white shadow-sm max-h-[50vh]">
            <table className="w-full text-xs">
              <thead className="border-b bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 w-10">#</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-24">Código</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Descrição</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-14">Unid.</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-32">Categoria</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 w-28">Preço {estado}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.slice(0, 200).map(r => (
                  <tr key={r.linha} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 text-gray-400">{r.linha}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-700">{r.codigo}</td>
                    <td className="px-3 py-1.5 text-gray-800 max-w-xs truncate">{r.descricao}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.unidade}</td>
                    <td className="px-3 py-1.5 text-gray-500">
                      {CATEGORIAS.find(c => c.key === r.catKey)?.label ?? r.catKey}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-700">
                      {r.preco > 0
                        ? r.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
                {rows.length > 200 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-2 text-center text-gray-400">
                      … e mais {(rows.length - 200).toLocaleString('pt-BR')} insumos
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {resultado && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4 space-y-1.5">
          <p className="text-sm font-semibold text-green-800">Importação concluída!</p>
          <ul className="text-sm text-green-700 space-y-0.5">
            <li>↻ {resultado.atualizados} insumo{resultado.atualizados !== 1 ? 's' : ''} com preço atualizado</li>
            <li>+ {resultado.inseridos} insumo{resultado.inseridos !== 1 ? 's' : ''} novo{resultado.inseridos !== 1 ? 's' : ''} inserido{resultado.inseridos !== 1 ? 's' : ''}</li>
            {resultado.semPreco > 0 && (
              <li className="text-gray-500">— {resultado.semPreco} insumo{resultado.semPreco !== 1 ? 's' : ''} sem preço para {estado}</li>
            )}
            {resultado.erros > 0 && (
              <li className="text-amber-700">⚠ {resultado.erros} erro{resultado.erros !== 1 ? 's' : ''} ao salvar</li>
            )}
          </ul>
          <Link href="/insumos" className="inline-block text-sm text-green-700 underline mt-1">
            Ver insumos →
          </Link>
        </div>
      )}

      {globalError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {globalError}
        </p>
      )}

      <div>
        <button
          type="button"
          onClick={() => router.push('/insumos/importar')}
          className="rounded-md border px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>

    </div>
  )
}
