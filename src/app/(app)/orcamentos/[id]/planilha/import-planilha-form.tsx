'use client'

import { useMemo, useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { importarEstrutura } from './planilha-import-action'
import type { EstruturaRow, ImportResult } from './planilha-import-action'
import { WizardSteps } from '@/components/ui/import-wizard'
import { formatCurrency } from '@/lib/costs'
import {
  CAMPOS, MAPEAMENTO_VAZIO, sugerirMapeamento, parseMatrix, construirAba, parseXlsxTodasAbas, matrixFromCsv,
  type CampoAlvo, type Mapeamento, type AbaBruta,
} from '@/lib/orcamento/planilha-excel-parser'

// ─── Componente ───────────────────────────────────────────────────────────────

const STEPS = [
  { key: 'arquivo', label: 'Arquivo' },
  { key: 'mapeamento', label: 'Colunas' },
  { key: 'preview', label: 'Prévia' },
  { key: 'resultado', label: 'Resultado' },
]

export function ImportPlanilhaForm({ orcamentoId, planilhaId }: { orcamentoId: string; planilhaId?: string | null }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [errosParse, setErrosParse] = useState<string[]>([])

  const [abas, setAbas] = useState<AbaBruta[] | null>(null)
  const [abaSelecionada, setAbaSelecionada] = useState<string>('')
  const [abaAutoDetectada, setAbaAutoDetectada] = useState<string>('')
  const [mapeamento, setMapeamento] = useState<Mapeamento | null>(null)
  const [mapeamentoConfirmado, setMapeamentoConfirmado] = useState(false)

  const abaAtual = abas?.find(a => a.nome === abaSelecionada) ?? null

  const preview = useMemo(() => {
    if (!abaAtual || !mapeamento) return null
    return parseMatrix(abaAtual.matrix, mapeamento, abaAtual.linhaCabecalho + 1).rows
  }, [abaAtual, mapeamento])

  function carregarAba(aba: AbaBruta) {
    setAbaSelecionada(aba.nome)
    setMapeamento(sugerirMapeamento(aba.header))
    setMapeamentoConfirmado(false)
    setErrosParse(aba.header.length === 0 ? ['Não foi possível identificar uma linha de cabeçalho nesta aba.'] : [])
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setResult(null); setErrosParse([]); setAbas(null); setAbaSelecionada(''); setAbaAutoDetectada('')
    setMapeamento(null); setMapeamentoConfirmado(false)

    const ab = await file.arrayBuffer()
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

    let todasAbas: AbaBruta[]
    let melhorIndice = 0

    if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
      const r = await parseXlsxTodasAbas(ab)
      todasAbas = r.abas
      melhorIndice = r.melhorIndice
    } else {
      const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(ab)
      const text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(ab) : utf8
      todasAbas = [construirAba('arquivo', matrixFromCsv(text))]
    }

    if (todasAbas.length > 1) {
      setAbas(todasAbas)
      setAbaAutoDetectada(todasAbas[melhorIndice].nome)
    }
    carregarAba(todasAbas[melhorIndice])
    if (todasAbas.length === 1) setAbas(todasAbas)
  }

  function trocarAba(nome: string) {
    const aba = abas?.find(a => a.nome === nome)
    if (aba) carregarAba(aba)
  }

  function alterarColunaDoIndice(idx: number, novoCampo: CampoAlvo | 'ignorar') {
    setMapeamento(prev => {
      if (!prev) return prev
      const next = { ...prev }
      for (const campo of Object.keys(next) as CampoAlvo[]) {
        if (next[campo] === idx) next[campo] = null
      }
      if (novoCampo !== 'ignorar') next[novoCampo] = idx
      return next
    })
  }

  function campoDoIndice(idx: number): CampoAlvo | 'ignorar' {
    if (!mapeamento) return 'ignorar'
    for (const campo of Object.keys(mapeamento) as CampoAlvo[]) {
      if (mapeamento[campo] === idx) return campo
    }
    return 'ignorar'
  }

  const camposFaltando = CAMPOS.filter(c => c.obrigatorio && mapeamento?.[c.key] == null)

  async function handleImport() {
    if (!preview?.length) return
    setLoading(true)
    try {
      const res = await importarEstrutura(orcamentoId, preview, planilhaId)
      setOpen(false)
      setAbas(null); setAbaSelecionada(''); setAbaAutoDetectada(''); setMapeamento(null); setMapeamentoConfirmado(false)
      if (inputRef.current) inputRef.current.value = ''
      startTransition(() => router.refresh())
      setResult(res)
    } catch (err) {
      setResult({ ok: 0, erros: [String(err)] })
    } finally {
      setLoading(false)
    }
  }

  function limpar() {
    setAbas(null); setAbaSelecionada(''); setAbaAutoDetectada(''); setMapeamento(null); setMapeamentoConfirmado(false)
    setErrosParse([])
    if (inputRef.current) inputRef.current.value = ''
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

  const step = result ? 'resultado' : mapeamentoConfirmado ? 'preview' : abaAtual ? 'mapeamento' : 'arquivo'

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">Importar Planilha Orçamentária</h3>
        <button
          onClick={() => { setOpen(false); setResult(null); limpar() }}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <WizardSteps steps={STEPS} currentKey={step} />

      {!abaAtual && (
        <>
          <div className="rounded-md bg-white border border-gray-200 p-3 text-xs text-gray-600 space-y-1">
            <p className="font-medium text-gray-700">Formatos aceitos: <span className="font-mono">.xlsx</span>, <span className="font-mono">.xls</span>, <span className="font-mono">.csv</span></p>
            <p className="text-gray-500">
              As colunas podem vir em <strong>qualquer ordem</strong>, com colunas extras que você não usa
              (ex.: "codLink", "Referência") — no próximo passo você escolhe o que cada coluna do seu
              arquivo representa, sem precisar editar o Excel.
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-gray-500">
              <li>Linhas sem código = capítulos/grupos</li>
              <li>Numeração hierárquica: <span className="font-mono">1, 1.1, 1.1.1</span> etc.</li>
              <li>Suporta formato BR (R$ 1.800,00) e números diretos</li>
              <li>Para XLSX com múltiplas abas, detecta automaticamente a aba com mais colunas reconhecidas — dá pra trocar depois</li>
            </ul>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.ods,.csv,.txt"
            onChange={handleFile}
            className="block text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:bg-blue-600 file:text-white file:font-medium hover:file:bg-blue-700 cursor-pointer"
          />
        </>
      )}

      {abas && abas.length > 1 && (
        <div className="rounded-md border border-blue-200 bg-white px-3 py-2 space-y-1">
          <div className="flex items-center gap-3">
            <label htmlFor="aba-planilha" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Aba do arquivo:
            </label>
            <select
              id="aba-planilha"
              value={abaSelecionada}
              onChange={e => trocarAba(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              {abas.map(a => (
                <option key={a.nome} value={a.nome}>
                  {a.nome}{a.nome === abaAutoDetectada ? ' — detectada automaticamente' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {errosParse.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {errosParse.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {/* ── Passo: mapeamento de colunas ─────────────────────────────────────── */}
      {abaAtual && abaAtual.header.length > 0 && !mapeamentoConfirmado && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Diga o que cada coluna do seu arquivo representa. Colunas marcadas como <strong>"Não usar"</strong> são
            ignoradas na importação.
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Coluna no arquivo</th>
                  <th className="px-3 py-2">Exemplo</th>
                  <th className="px-3 py-2">Usar como</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {abaAtual.header.map((h, i) => {
                  const exemplo = String(abaAtual.matrix[abaAtual.linhaCabecalho + 1]?.[i] ?? '').trim()
                  const atual = campoDoIndice(i)
                  return (
                    <tr key={i} className={atual === 'ignorar' ? 'text-gray-400' : ''}>
                      <td className="px-3 py-2 font-medium text-gray-800">{h || `Coluna ${i + 1}`}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate">{exemplo || '—'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={atual}
                          onChange={e => alterarColunaDoIndice(i, e.target.value as CampoAlvo | 'ignorar')}
                          className="rounded border border-gray-300 px-2 py-1 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        >
                          <option value="ignorar">Não usar</option>
                          {CAMPOS.map(c => (
                            <option key={c.key} value={c.key} disabled={mapeamento?.[c.key] != null && mapeamento[c.key] !== i}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {camposFaltando.length > 0 && (
            <p className="text-xs text-amber-700">
              Falta mapear: {camposFaltando.map(c => c.label).join(', ')} (obrigatório).
            </p>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {preview?.length ?? 0} linha(s) reconhecida(s) com o mapeamento atual — a prévia abaixo já reflete suas escolhas.
            </p>
            <button
              onClick={() => setMapeamentoConfirmado(true)}
              disabled={camposFaltando.length > 0 || !preview?.length}
              className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Confirmar colunas →
            </button>
          </div>

          {preview && preview.length > 0 && (
            <PreviewTable preview={preview} />
          )}
        </div>
      )}

      {/* ── Passo: prévia final + confirmação ────────────────────────────────── */}
      {mapeamentoConfirmado && preview && preview.length > 0 && (
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
                onClick={() => setMapeamentoConfirmado(false)}
                className="rounded border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                ← Ajustar colunas
              </button>
              <button
                onClick={() => { limpar(); setResult(null); }}
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
          <PreviewTable preview={preview} />
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

function PreviewTable({ preview }: { preview: EstruturaRow[] }) {
  return (
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
                  ? formatCurrency(r.custo_unitario)
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
  )
}
