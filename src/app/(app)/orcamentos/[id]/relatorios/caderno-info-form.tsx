'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { salvarInfoCadernoAction } from './salvar-info-caderno-action'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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

export function CadernoInfoForm({
  orcamentoId, nomeObra, codigo, cliente, local, data, areaTotal, areaCoberta, areaEquivalente, servicosEstimados,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
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
  // Sem UI de edição aqui (removida — a aba Estimados é o lugar certo pra
  // marcar serviços estimados). Mantido só pra reenviar os registros
  // existentes sem alteração no "Salvar dados do Caderno" — salvarDadosCadastrais
  // faz delete+insert de orcamento_servicos_estimados a cada chamada, então
  // omitir esse campo apagaria entradas manuais legadas de quem já tinha.
  const [servicos] = useState<ServicoForm[]>(
    servicosEstimados.map(s => ({ id: s.id, descricao: s.descricao, valor: String(s.valor) }))
  )
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
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
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.')
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

      <Input label="Nome da obra" required value={form.nome_obra} onChange={e => update('nome_obra', e.target.value)} />

      <div className="grid grid-cols-2 gap-2">
        <Input label="Código" value={form.codigo} onChange={e => update('codigo', e.target.value)} />
        <Input type="date" label="Data" value={form.data} onChange={e => update('data', e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Input label="Cliente" value={form.cliente} onChange={e => update('cliente', e.target.value)} placeholder="Ex: João Silva" />
        <Input label="Local" value={form.local} onChange={e => update('local', e.target.value)} placeholder="Ex: Conceição do Pará - MG" />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Input type="number" min="0" step="0.01" label="Área total (m²)" value={form.area_total} onChange={e => update('area_total', e.target.value)} />
        <Input type="number" min="0" step="0.01" label="Área coberta (m²)" value={form.area_coberta} onChange={e => update('area_coberta', e.target.value)} />
        <Input type="number" min="0" step="0.01" label="Área equiv. (m²)" value={form.area_equivalente} onChange={e => update('area_equivalente', e.target.value)} />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-2 pt-1">
        <Button type="button" size="sm" onClick={handleSalvar} loading={loading}>
          Salvar dados do Caderno
        </Button>
        {saved && !loading && <span className="text-xs text-emerald-600">Salvo.</span>}
      </div>
    </div>
  )
}
