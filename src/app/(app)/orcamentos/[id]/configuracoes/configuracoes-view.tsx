'use client'

import { useState, useTransition } from 'react'
import { X, Plus, Building2, User, Hash, Ruler, PieChart } from 'lucide-react'
import { salvarConfiguracoes } from './configuracoes-action'
import { CATEGORIAS_DISTRIBUICAO_CUSTOS, CATEGORIA_OUTROS, sugerirCategoria } from '@/lib/orcamento/categorias-grafico'
import { Input } from '@/components/ui/input'
import { Button, IconButton } from '@/components/ui/button'

const MIN_NIVEIS = 1
const MAX_NIVEIS = 6
const MIN_DIGITOS = 1
const MAX_DIGITOS = 6
const DIGITOS_PADRAO = 2

const MINI_INP = 'rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20'
const LABEL = 'text-sm font-medium text-gray-700'

/** Card de configuração sempre visível — nada de acordeão: o orçamentista precisa ver
 * BDI, numeração e cliente de uma vez, sem cliques extras para revelar cada seção. */
function SettingsCard({ title, icon, span, children }: {
  title: string
  icon: React.ReactNode
  span?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm ${span ? 'lg:col-span-2' : ''}`}>
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
          {icon}
        </span>
        <span className="text-sm font-semibold text-gray-900">{title}</span>
      </div>
      <div className="space-y-4 px-5 py-5">
        {children}
      </div>
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
        setErro(err instanceof Error ? err.message : 'Não foi possível salvar as configurações. Tente novamente.')
      }
    })
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SettingsCard title="Dados Principais" icon={<Building2 size={16} />} span>
        <Input label="Nome da obra" required value={form.nome_obra} onChange={e => update('nome_obra', e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Código" value={form.codigo} onChange={e => update('codigo', e.target.value)} />
          <Input type="date" label="Data" value={form.data} onChange={e => update('data', e.target.value)} />
        </div>
        <Input label="Local" value={form.local} onChange={e => update('local', e.target.value)} placeholder="Ex: Conceição do Pará - MG" />
      </SettingsCard>

      <SettingsCard title="Dados do Cliente" icon={<User size={16} />}>
        <Input label="Cliente" value={form.cliente} onChange={e => update('cliente', e.target.value)} placeholder="Ex: João Silva" />
      </SettingsCard>

      <SettingsCard title="BDI e Numeração" icon={<Hash size={16} />}>
        <Input type="number" min="0" step="0.01" label="BDI global (%)" className="max-w-40" value={form.bdi_global} onChange={e => update('bdi_global', e.target.value)} />

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
                className="flex-1 accent-primary-600"
              />
              <input
                type="number" min={MIN_NIVEIS} max={MAX_NIVEIS} value={digitos.length}
                onChange={e => setNiveis(Math.min(MAX_NIVEIS, Math.max(MIN_NIVEIS, parseInt(e.target.value) || MIN_NIVEIS)))}
                className={`w-16 ${MINI_INP}`}
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
                    className={`w-16 ${MINI_INP}`}
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
      </SettingsCard>

      <SettingsCard title="Dados Gerais" icon={<Ruler size={16} />} span>
        <div>
          <h3 className={LABEL}>Resumo Geral do Orçamento</h3>
          <p className="text-xs text-gray-500 mt-0.5">Usado no Caderno de Orçamento (Resumo Geral e Custo/m²).</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Input type="number" min="0" step="0.01" label="Área total (m²)" value={form.area_total} onChange={e => update('area_total', e.target.value)} />
          <Input type="number" min="0" step="0.01" label="Área coberta (m²)" value={form.area_coberta} onChange={e => update('area_coberta', e.target.value)} />
          <Input type="number" min="0" step="0.01" label="Área equivalente (m²)" value={form.area_equivalente} onChange={e => update('area_equivalente', e.target.value)} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className={LABEL}>Serviços estimados (B)</label>
            <button type="button" onClick={addServico} className="flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline">
              <Plus size={12} /> Adicionar
            </button>
          </div>
          {servicos.length === 0 && (
            <p className="text-xs text-gray-400">Nenhum serviço estimado cadastrado.</p>
          )}
          {servicos.map((s, i) => (
            <div key={s.id ?? `new-${i}`} className="flex gap-2">
              <Input
                value={s.descricao} onChange={e => updateServico(i, 'descricao', e.target.value)}
                placeholder="Descrição" className="flex-1"
              />
              <Input
                type="number" min="0" step="0.01" value={s.valor} onChange={e => updateServico(i, 'valor', e.target.value)}
                placeholder="Valor (R$)" className="w-36"
              />
              <IconButton label="Remover serviço" icon={<X size={14} />} variant="outline" onClick={() => removeServico(i)} />
            </div>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title="Distribuição de Custos (Gráfico)" icon={<PieChart size={16} />} span>
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
                  className="w-64 shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
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
      </SettingsCard>

      <div className="space-y-2 pt-1 lg:col-span-2">
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <div className="flex items-center gap-3">
          <Button onClick={handleSalvar} loading={isPending}>
            Salvar configurações
          </Button>
          {salvo && <span className="text-sm text-emerald-600">Configurações salvas com sucesso.</span>}
        </div>
      </div>
    </div>
  )
}
