'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { salvarInfoCadernoAction } from './salvar-info-caderno-action'

interface ServicoForm {
  id?: string
  descricao: string
  valor: string
}

interface Props {
  orcamentoId: string
  nomeObra: string
  codigo: string | null
  cliente: string | null
  local: string | null
  data: string
  areaTotal: number | null
  areaCoberta: number | null
  areaEquivalente: number | null
  servicosEstimados: { id?: string; descricao: string; valor: number }[]
}

const INP = 'w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
const LABEL = 'text-xs font-medium text-gray-600'

export function CadernoInfoForm({
  orcamentoId, nomeObra, codigo, cliente, local, data, areaTotal, areaCoberta, areaEquivalente, servicosEstimados,
}: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    nome_obra: nomeObra,
    codigo: codigo ?? '',
    cliente: cliente ?? '',
    local: local ?? '',
    data: data ?? '',
    area_total: areaTotal != null ? String(areaTotal) : '',
    area_coberta: areaCoberta != null ? String(areaCoberta) : '',
    area_equivalente: areaEquivalente != null ? String(areaEquivalente) : '',
  })
  const [servicos, setServicos] = useState<ServicoForm[]>(
    servicosEstimados.map(s => ({ id: s.id, descricao: s.descricao, valor: String(s.valor) }))
  )
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  function updateServico(index: number, field: 'descricao' | 'valor', value: string) {
    setServicos(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
    setSaved(false)
  }

  function addServico() {
    setServicos(prev => [...prev, { descricao: '', valor: '' }])
    setSaved(false)
  }

  function removeServico(index: number) {
    setServicos(prev => prev.filter((_, i) => i !== index))
    setSaved(false)
  }

  async function handleSalvar() {
    setError(null)
    if (!form.nome_obra.trim()) { setError('Informe o nome da obra.'); return }

    const servicosValidos = servicos
      .map(s => ({ descricao: s.descricao.trim(), valor: parseFloat(s.valor.replace(',', '.')) || 0 }))
      .filter(s => s.descricao)

    setLoading(true)
    try {
      await salvarInfoCadernoAction(orcamentoId, {
        nome_obra: form.nome_obra.trim(),
        codigo: form.codigo.trim() || null,
        cliente: form.cliente.trim() || null,
        local: form.local.trim() || null,
        data: form.data,
        area_total: form.area_total ? parseFloat(form.area_total.replace(',', '.')) : null,
        area_coberta: form.area_coberta ? parseFloat(form.area_coberta.replace(',', '.')) : null,
        area_equivalente: form.area_equivalente ? parseFloat(form.area_equivalente.replace(',', '.')) : null,
        servicos_estimados: servicosValidos,
      })
      setSaved(true)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-700">Dados do Caderno</p>
        <p className="text-xs text-gray-400 mt-0.5">Informações que não vêm da planilha — capa, resumo geral e custo por m².</p>
      </div>

      <div className="space-y-1">
        <label className={LABEL}>Nome da obra *</label>
        <input value={form.nome_obra} onChange={e => update('nome_obra', e.target.value)} className={INP} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className={LABEL}>Código</label>
          <input value={form.codigo} onChange={e => update('codigo', e.target.value)} className={INP} />
        </div>
        <div className="space-y-1">
          <label className={LABEL}>Data</label>
          <input type="date" value={form.data} onChange={e => update('data', e.target.value)} className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className={LABEL}>Cliente</label>
          <input value={form.cliente} onChange={e => update('cliente', e.target.value)} placeholder="Ex: João Silva" className={INP} />
        </div>
        <div className="space-y-1">
          <label className={LABEL}>Local</label>
          <input value={form.local} onChange={e => update('local', e.target.value)} placeholder="Ex: Conceição do Pará - MG" className={INP} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className={LABEL}>Área total (m²)</label>
          <input type="number" min="0" step="0.01" value={form.area_total} onChange={e => update('area_total', e.target.value)} className={INP} />
        </div>
        <div className="space-y-1">
          <label className={LABEL}>Área coberta (m²)</label>
          <input type="number" min="0" step="0.01" value={form.area_coberta} onChange={e => update('area_coberta', e.target.value)} className={INP} />
        </div>
        <div className="space-y-1">
          <label className={LABEL}>Área equiv. (m²)</label>
          <input type="number" min="0" step="0.01" value={form.area_equivalente} onChange={e => update('area_equivalente', e.target.value)} className={INP} />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className={LABEL}>Serviços estimados (B)</label>
          <button type="button" onClick={addServico} className="text-xs font-medium text-blue-600 hover:underline">
            + Adicionar
          </button>
        </div>
        {servicos.length === 0 && <p className="text-xs text-gray-400">Nenhum serviço estimado cadastrado.</p>}
        {servicos.map((s, i) => (
          <div key={s.id ?? `new-${i}`} className="flex gap-1.5">
            <input value={s.descricao} onChange={e => updateServico(i, 'descricao', e.target.value)}
              placeholder="Descrição" className={`${INP} flex-1`} />
            <input type="number" min="0" step="0.01" value={s.valor} onChange={e => updateServico(i, 'valor', e.target.value)}
              placeholder="Valor (R$)" className={`${INP} w-28`} />
            <button type="button" onClick={() => removeServico(i)}
              className="rounded-md border border-gray-300 px-2 text-sm text-gray-500 hover:bg-gray-50">×</button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSalvar}
          disabled={loading}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Salvando...' : 'Salvar dados do Caderno'}
        </button>
        {saved && !loading && <span className="text-xs text-emerald-600">Salvo.</span>}
      </div>
    </div>
  )
}
