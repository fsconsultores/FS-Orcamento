'use client'

import { useState, useTransition } from 'react'
import { salvarConfiguracoes } from './configuracoes-action'
import { CATEGORIAS_DISTRIBUICAO_CUSTOS, CATEGORIA_OUTROS, sugerirCategoria } from '@/lib/orcamento/categorias-grafico'

const MIN_NIVEIS = 1
const MAX_NIVEIS = 6
const MIN_DIGITOS = 1
const MAX_DIGITOS = 6
const DIGITOS_PADRAO = 2

const INP = 'w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
const LABEL = 'text-sm font-medium text-gray-700'

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

function AccordionSection({ title, defaultOpen = false, children }: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-500">
          <ChevronIcon open={open} />
        </span>
        <span className="text-sm font-bold text-[#1f4e79]">{title}</span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

interface ServicoEstimadoForm {
  id?: string
  descricao: string
  valor: string
}

export function ConfiguracoesView({
  orcamentoId, nomeObra, codigo, cliente, local, dataOrcamento, bdiGlobal,
  areaTotal, areaCoberta, areaEquivalente, numeracaoDigitos, servicosEstimados,
  gruposNivel1, categoriasGrafico,
}: {
  orcamentoId: string
  nomeObra: string
  codigo: string
  cliente: string
  local: string
  dataOrcamento: string
  bdiGlobal: number
  areaTotal: number | null
  areaCoberta: number | null
  areaEquivalente: number | null
  numeracaoDigitos: number[]
  servicosEstimados: { id?: string; descricao: string; valor: number }[]
  gruposNivel1: { numero: string; descricao: string }[]
  categoriasGrafico: Record<string, string>
}) {
  const [form, setForm] = useState({
    nome_obra: nomeObra,
    codigo: codigo,
    cliente: cliente,
    local: local,
    data: dataOrcamento,
    bdi_global: String(bdiGlobal),
    area_total: areaTotal != null ? String(areaTotal) : '',
    area_coberta: areaCoberta != null ? String(areaCoberta) : '',
    area_equivalente: areaEquivalente != null ? String(areaEquivalente) : '',
  })
  const [servicos, setServicos] = useState<ServicoEstimadoForm[]>(
    servicosEstimados.map(s => ({ id: s.id, descricao: s.descricao, valor: String(s.valor) }))
  )
  const [digitos, setDigitos] = useState<number[]>(numeracaoDigitos.length > 0 ? numeracaoDigitos : [1, 1, 1, 1])
  const [categorias, setCategorias] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const g of gruposNivel1) map[g.numero] = categoriasGrafico[g.numero] || sugerirCategoria(g.descricao)
    return map
  })

  const [isPending, startTransition] = useTransition()
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function update(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setSalvo(false)
  }

  function updateServico(index: number, field: 'descricao' | 'valor', value: string) {
    setServicos(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
    setSalvo(false)
  }

  function addServico() {
    setServicos(prev => [...prev, { descricao: '', valor: '' }])
    setSalvo(false)
  }

  function removeServico(index: number) {
    setServicos(prev => prev.filter((_, i) => i !== index))
    setSalvo(false)
  }

  function setNiveis(n: number) {
    setDigitos(prev => {
      const next = prev.slice(0, n)
      while (next.length < n) next.push(DIGITOS_PADRAO)
      return next
    })
    setSalvo(false)
  }

  function setDigito(idx: number, valor: number) {
    setDigitos(prev => prev.map((d, i) => i === idx ? valor : d))
    setSalvo(false)
  }

  function setCategoria(numero: string, categoria: string) {
    setCategorias(prev => ({ ...prev, [numero]: categoria }))
    setSalvo(false)
  }

  const exemploNumeracao = digitos.map((d, i) => String(i + 1).padStart(d, '0')).join('.')

  function handleSalvar() {
    setErro(null)
    if (!form.nome_obra.trim()) { setErro('Informe o nome da obra.'); return }
    const bdi = parseFloat(form.bdi_global.replace(',', '.'))
    if (isNaN(bdi) || bdi < 0) { setErro('BDI global inválido.'); return }

    const servicosValidos = servicos
      .map(s => ({ descricao: s.descricao.trim(), valor: parseFloat(s.valor.replace(',', '.')) || 0 }))
      .filter(s => s.descricao)

    startTransition(async () => {
      try {
        await salvarConfiguracoes(orcamentoId, {
          nome_obra: form.nome_obra.trim(),
          codigo: form.codigo.trim() || null,
          cliente: form.cliente.trim() || null,
          local: form.local.trim() || null,
          data: form.data,
          bdi_global: bdi,
          area_total: form.area_total ? parseFloat(form.area_total.replace(',', '.')) : null,
          area_coberta: form.area_coberta ? parseFloat(form.area_coberta.replace(',', '.')) : null,
          area_equivalente: form.area_equivalente ? parseFloat(form.area_equivalente.replace(',', '.')) : null,
          numeracao_digitos: digitos,
          servicos_estimados: servicosValidos,
          categorias_grafico: categorias,
        })
        setSalvo(true)
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Erro ao salvar configurações.')
      }
    })
  }

  return (
    <div className="max-w-2xl space-y-3">
      <AccordionSection title="Dados Principais" defaultOpen>
        <div className="space-y-1">
          <label className={LABEL}>Nome da obra *</label>
          <input value={form.nome_obra} onChange={e => update('nome_obra', e.target.value)} className={INP} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={LABEL}>Código</label>
            <input value={form.codigo} onChange={e => update('codigo', e.target.value)} className={INP} />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>Data</label>
            <input type="date" value={form.data} onChange={e => update('data', e.target.value)} className={INP} />
          </div>
        </div>
        <div className="space-y-1">
          <label className={LABEL}>Local</label>
          <input value={form.local} onChange={e => update('local', e.target.value)} placeholder="Ex: Conceição do Pará - MG" className={INP} />
        </div>
      </AccordionSection>

      <AccordionSection title="Dados do Cliente">
        <div className="space-y-1">
          <label className={LABEL}>Cliente</label>
          <input value={form.cliente} onChange={e => update('cliente', e.target.value)} placeholder="Ex: João Silva" className={INP} />
        </div>
      </AccordionSection>

      <AccordionSection title="Bases de Dados">
        <div className="space-y-1">
          <label className={LABEL}>BDI global (%)</label>
          <input type="number" min="0" step="0.01" value={form.bdi_global} onChange={e => update('bdi_global', e.target.value)} className={`${INP} max-w-40`} />
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div>
            <p className={LABEL}>Numeração da Planilha</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Defina quantos níveis a numeração hierárquica (EAP) deve ter e quantos dígitos usar em cada nível.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Quantidade de níveis no orçamento</label>
            <div className="flex items-center gap-4">
              <input
                type="range" min={MIN_NIVEIS} max={MAX_NIVEIS} value={digitos.length}
                onChange={e => setNiveis(parseInt(e.target.value))}
                className="flex-1 accent-[#442246]"
              />
              <input
                type="number" min={MIN_NIVEIS} max={MAX_NIVEIS} value={digitos.length}
                onChange={e => setNiveis(Math.min(MAX_NIVEIS, Math.max(MIN_NIVEIS, parseInt(e.target.value) || MIN_NIVEIS)))}
                className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-400">Quantidade de caracteres por nível</label>
            <div className="flex flex-wrap gap-2">
              {digitos.map((d, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Nível {i + 1}</span>
                  <input
                    type="number" min={MIN_DIGITOS} max={MAX_DIGITOS} value={d}
                    onChange={e => setDigito(i, Math.min(MAX_DIGITOS, Math.max(MIN_DIGITOS, parseInt(e.target.value) || MIN_DIGITOS)))}
                    className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-gray-50 border border-gray-100 px-3 py-2">
            <p className="text-xs text-gray-500">
              Exemplo de numeração: <span className="font-mono font-medium text-gray-700">{exemploNumeracao}</span>
            </p>
          </div>
        </div>
      </AccordionSection>

      <AccordionSection title="Dados Gerais">
        <div>
          <h3 className={LABEL}>Resumo Geral do Orçamento</h3>
          <p className="text-xs text-gray-500 mt-0.5">Usado no Caderno de Orçamento (Resumo Geral e Custo/m²).</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className={LABEL}>Área total (m²)</label>
            <input type="number" min="0" step="0.01" value={form.area_total} onChange={e => update('area_total', e.target.value)} className={INP} />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>Área coberta (m²)</label>
            <input type="number" min="0" step="0.01" value={form.area_coberta} onChange={e => update('area_coberta', e.target.value)} className={INP} />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>Área equivalente (m²)</label>
            <input type="number" min="0" step="0.01" value={form.area_equivalente} onChange={e => update('area_equivalente', e.target.value)} className={INP} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className={LABEL}>Serviços estimados (B)</label>
            <button type="button" onClick={addServico} className="text-xs font-medium text-blue-600 hover:underline">
              + Adicionar
            </button>
          </div>
          {servicos.length === 0 && (
            <p className="text-xs text-gray-400">Nenhum serviço estimado cadastrado.</p>
          )}
          {servicos.map((s, i) => (
            <div key={s.id ?? `new-${i}`} className="flex gap-2">
              <input
                value={s.descricao} onChange={e => updateServico(i, 'descricao', e.target.value)}
                placeholder="Descrição" className={`${INP} flex-1`}
              />
              <input
                type="number" min="0" step="0.01" value={s.valor} onChange={e => updateServico(i, 'valor', e.target.value)}
                placeholder="Valor (R$)" className={`${INP} w-36`}
              />
              <button type="button" onClick={() => removeServico(i)} className="rounded-md border border-gray-300 px-2.5 text-sm text-gray-500 hover:bg-gray-50">
                ×
              </button>
            </div>
          ))}
        </div>
      </AccordionSection>

      <AccordionSection title="Distribuição de Custos (Gráfico)">
        <div>
          <p className="text-xs text-gray-500">
            Define em qual categoria do gráfico &quot;Distribuição dos Custos (A)&quot; do Caderno de Orçamento
            cada grupo de nível 1 da planilha entra. Grupos não ajustados usam uma sugestão automática.
          </p>
        </div>

        {gruposNivel1.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhum grupo de nível 1 cadastrado na planilha.</p>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
            {gruposNivel1.map(g => (
              <div key={g.numero} className="flex items-center gap-2">
                <span className="w-16 shrink-0 font-mono text-xs text-gray-400">{g.numero}</span>
                <span className="flex-1 text-sm text-gray-700 truncate" title={g.descricao}>{g.descricao}</span>
                <select
                  value={categorias[g.numero] ?? CATEGORIA_OUTROS}
                  onChange={e => setCategoria(g.numero, e.target.value)}
                  className="w-64 shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  {CATEGORIAS_DISTRIBUICAO_CUSTOS.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value={CATEGORIA_OUTROS}>{CATEGORIA_OUTROS}</option>
                </select>
              </div>
            ))}
          </div>
        )}
      </AccordionSection>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSalvar}
          disabled={isPending}
          className="rounded-md bg-[#442246] px-5 py-2 text-sm font-medium text-white hover:bg-[#5a2d5e] disabled:opacity-50"
        >
          {isPending ? 'Salvando...' : 'Salvar configurações'}
        </button>
        {salvo && <span className="text-sm text-emerald-600">Configurações salvas com sucesso.</span>}
      </div>
    </div>
  )
}
