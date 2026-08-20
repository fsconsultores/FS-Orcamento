'use client'

import { useId, useRef, useState } from 'react'
import { MOTIVOS_ESTIMADO_PRESET, OUTRO_ESTIMADO_SENTINEL } from '@/lib/orcamento/estimado-motivos'

export interface CotacaoModalAlvo {
  codigo: string
  descricao: string
  custo: number
  fornecedor?: string | null
  data_cotacao?: string | null
  cotacao_observacoes?: string | null
  estimado?: boolean | null
  estimado_motivo?: string | null
}

export interface CotacaoSalva {
  preco: number
  fornecedor: string | null
  dataCotacao: string | null
  observacoes: string | null
  estimado: boolean
  estimadoMotivo: string | null
}

function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Modal de preço + cotação (fornecedor/data/observações/estimado) — mesmo
 * formulário usado na aba Insumos e, agora, dentro de uma composição
 * específica (composicao-detail.tsx). Não sabe nada sobre ONDE o preço vai
 * ser salvo — só coleta os dados e chama `onSave`; quem chama decide se isso
 * sincroniza globalmente (avulso, via atualizarPrecoInsumoAction) ou fica só
 * naquela linha (composição específica, via atualizarInsumoComposicaoAction)
 * — é essa diferença que permite "estimado só nesta composição".
 */
export function CotacaoInsumoModal({
  alvo,
  onClose,
  onSave,
  escopoComposicaoLabel,
}: {
  alvo: CotacaoModalAlvo
  onClose: () => void
  onSave: (payload: CotacaoSalva) => Promise<void>
  /** Ex.: "Parede de exemplo 01" — mostra que a marcação de estimado é só desta composição. */
  escopoComposicaoLabel?: string
}) {
  const motivoAtual = alvo.estimado_motivo ?? null
  const motivoEhPreset = motivoAtual && (MOTIVOS_ESTIMADO_PRESET as readonly string[]).includes(motivoAtual)

  const [preco, setPreco] = useState(String(alvo.custo || ''))
  const [fornecedor, setFornecedor] = useState(alvo.fornecedor ?? '')
  const [dataCotacao, setDataCotacao] = useState(alvo.data_cotacao ?? hojeISO())
  const [observacoes, setObservacoes] = useState(alvo.cotacao_observacoes ?? '')
  const [estimado, setEstimado] = useState(alvo.estimado ?? false)
  const [motivoSelecionado, setMotivoSelecionado] = useState(motivoEhPreset ? motivoAtual! : (motivoAtual ? OUTRO_ESTIMADO_SENTINEL : MOTIVOS_ESTIMADO_PRESET[0]))
  const [motivoTextoLivre, setMotivoTextoLivre] = useState(motivoEhPreset ? '' : (motivoAtual ?? ''))
  const [salvando, setSalvando] = useState(false)
  const [erroPreco, setErroPreco] = useState<string | null>(null)

  const idPreco = useId()
  const idFornecedor = useId()
  const idDataCotacao = useId()
  const idObservacoes = useId()

  async function handleSalvar() {
    if (salvando) return
    const str = preco.trim().replace(',', '.')
    const precoNum = str === '' ? 0 : parseFloat(str)
    if (isNaN(precoNum) || precoNum < 0) { setErroPreco('Preço inválido — use um número maior ou igual a zero.'); return }
    setErroPreco(null)

    const estimadoMotivo = estimado
      ? ((motivoSelecionado === OUTRO_ESTIMADO_SENTINEL ? motivoTextoLivre : motivoSelecionado).trim() || null)
      : null

    setSalvando(true)
    try {
      await onSave({
        preco: precoNum,
        fornecedor: fornecedor.trim() || null,
        dataCotacao: dataCotacao || null,
        observacoes: observacoes.trim() || null,
        estimado,
        estimadoMotivo,
      })
    } finally {
      setSalvando(false)
    }
  }

  // Fecha só quando o mousedown E o click começaram no próprio backdrop —
  // evita fechar ao selecionar texto dentro do modal e soltar o botão fora.
  const mouseDownOnBackdrop = useRef(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      onClick={e => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget && !salvando) onClose()
        mouseDownOnBackdrop.current = false
      }}>
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Preço e cotação</h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">
              {alvo.codigo} — {alvo.descricao}
            </p>
            {escopoComposicaoLabel && (
              <p className="mt-1 text-xs text-blue-600">
                O preço atualiza em todo o orçamento; "estimado" vale só para <strong>{escopoComposicaoLabel}</strong>.
              </p>
            )}
          </div>
          <button onClick={onClose} disabled={salvando}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label htmlFor={idPreco} className="mb-1 block text-xs font-medium text-gray-600">Preço</label>
            <input
              id={idPreco}
              autoFocus type="number" min="0" step="any"
              value={preco}
              onChange={e => { setPreco(e.target.value); if (erroPreco) setErroPreco(null) }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSalvar() } }}
              aria-invalid={!!erroPreco}
              className={`w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 ${
                erroPreco
                  ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500/20'
              }`}
            />
            {erroPreco && <p className="mt-1 text-xs text-red-600">{erroPreco}</p>}
          </div>
          <div>
            <label htmlFor={idFornecedor} className="mb-1 block text-xs font-medium text-gray-600">Fornecedor</label>
            <input
              id={idFornecedor}
              type="text" placeholder="Ex.: Construmax"
              value={fornecedor}
              onChange={e => setFornecedor(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSalvar() } }}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label htmlFor={idDataCotacao} className="mb-1 block text-xs font-medium text-gray-600">Data da cotação</label>
            <input
              id={idDataCotacao}
              type="date"
              value={dataCotacao}
              onChange={e => setDataCotacao(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label htmlFor={idObservacoes} className="mb-1 block text-xs font-medium text-gray-600">Observações <span className="font-normal text-gray-400">(opcional)</span></label>
            <textarea
              id={idObservacoes}
              rows={2} placeholder="Ex.: Preço negociado para compra acima de 500 unidades."
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-amber-900 cursor-pointer">
              <input
                type="checkbox"
                checked={estimado}
                onChange={e => setEstimado(e.target.checked)}
                className="h-4 w-4 accent-amber-500 cursor-pointer"
              />
              Este é um preço estimado (provisório){escopoComposicaoLabel ? ' nesta composição' : ''}
            </label>
            {estimado && (
              <div className="mt-2 space-y-2">
                <select
                  value={motivoSelecionado}
                  onChange={e => setMotivoSelecionado(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                >
                  {MOTIVOS_ESTIMADO_PRESET.map(m => <option key={m} value={m}>{m}</option>)}
                  <option value={OUTRO_ESTIMADO_SENTINEL}>Outro…</option>
                </select>
                {motivoSelecionado === OUTRO_ESTIMADO_SENTINEL && (
                  <textarea
                    rows={2} placeholder="Descreva o motivo"
                    value={motivoTextoLivre}
                    onChange={e => setMotivoTextoLivre(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
                  />
                )}
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose} disabled={salvando}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSalvar} disabled={salvando}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
