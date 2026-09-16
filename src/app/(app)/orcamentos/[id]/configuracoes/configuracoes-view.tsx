'use client'

import { useState, useTransition } from 'react'
import { X, Plus, Building2, Hash, Ruler, PieChart, Layers, ClipboardList } from 'lucide-react'
import { salvarConfiguracoes } from './configuracoes-action'
import { CATEGORIAS_DISTRIBUICAO_CUSTOS, CATEGORIA_OUTROS, sugerirCategoria } from '@/lib/orcamento/categorias-grafico'
import type { CategoriaResumoGrupo } from '@/lib/orcamento/categorias-resumo'
import { Input } from '@/components/ui/input'
import { Button, IconButton } from '@/components/ui/button'
import { type ModeloAcrescimo } from '@/lib/orcamento/modelo-acrescimo'
import { ModeloAcrescimoSelect } from '../../modelo-acrescimo-select'
import { TaxaAdministracaoItensEditor, type TaxaAdministracaoItemForm } from '../../taxa-administracao-itens-editor'
import { CategoriasResumoEditor, type CategoriaResumoForm } from '../../categorias-resumo-editor'
import { useToast } from '@/components/ui/toast'

const MIN_NIVEIS = 1
const MAX_NIVEIS = 6
const MIN_DIGITOS = 1
const MAX_DIGITOS = 6
const DIGITOS_PADRAO = 2

const MINI_INP = 'rounded-md border border-gray-300 px-2 py-1.5 text-sm text-center outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20'
const LABEL = 'text-sm font-medium text-gray-700'

type SectionId = 'identificacao' | 'calculo' | 'areas' | 'estimados' | 'grafico' | 'categorias'

interface SectionDef {
  id: SectionId
  label: string
  icon: React.ReactNode
}

// 6 seções em vez de 6 cards soltos todos visíveis ao mesmo tempo — só a
// seção ativa mostra seus campos (lei de Hick: menos opções à vista por vez
// = decisão mais rápida sobre o que mexer). A navegação fica num raio fixo
// (sticky), sempre no mesmo lugar e com alvos grandes (lei de Fitts) — e o
// botão Salvar fica logo abaixo do conteúdo da seção ativa, nunca mais do
// fim de uma única seção de distância (bem mais perto do que rolar a página
// toda de 6 cards, como antes).
const SECTIONS: SectionDef[] = [
  { id: 'identificacao', label: 'Identificação', icon: <Building2 size={16} /> },
  { id: 'calculo', label: 'Cálculo e numeração', icon: <Hash size={16} /> },
  { id: 'areas', label: 'Áreas e pavimentos', icon: <Ruler size={16} /> },
  { id: 'estimados', label: 'Serviços estimados', icon: <ClipboardList size={16} /> },
  { id: 'grafico', label: 'Distribuição de custos', icon: <PieChart size={16} /> },
  { id: 'categorias', label: 'Categorias do Resumo Geral', icon: <Layers size={16} /> },
]

function SectionNav({ active, onChange }: { active: SectionId; onChange: (id: SectionId) => void }) {
  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 lg:sticky lg:top-6 lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-visible lg:pb-0">
      {SECTIONS.map(s => {
        const isActive = s.id === active
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors lg:whitespace-normal ${
              isActive ? 'bg-primary-50 text-primary-800' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <span className={isActive ? 'text-primary-700' : 'text-gray-400'}>{s.icon}</span>
            {s.label}
          </button>
        )
      })}
    </nav>
  )
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
    </div>
  )
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">{children}</div>
}

interface ServicoEstimadoForm {
  id?: string
  descricao: string
  valor: string
}

interface PavimentoForm {
  id?: string
  descricao: string
  unidade: string
  area_total: string
  area_equivalente: string
  area_coberta: string
}

export function ConfiguracoesView({
  orcamentoId, nomeObra, codigo, cliente, local, dataOrcamento, bdiGlobal, modeloAcrescimo,
  taxaAdministracaoItens,
  areaTotal, areaCoberta, areaEquivalente, numeracaoDigitos, servicosEstimados, pavimentos,
  gruposNivel1, gruposNivel1Resumo, categoriasGrafico, categoriasResumo,
}: {
  orcamentoId: string
  nomeObra: string
  codigo: string
  cliente: string
  local: string
  dataOrcamento: string
  bdiGlobal: number
  modeloAcrescimo: ModeloAcrescimo
  taxaAdministracaoItens: { id?: string; descricao: string; percentual: number }[]
  areaTotal: number | null
  areaCoberta: number | null
  areaEquivalente: number | null
  numeracaoDigitos: number[]
  servicosEstimados: { id?: string; descricao: string; valor: number }[]
  pavimentos: { id?: string; descricao: string; unidade: string; area_total: number; area_equivalente: number; area_coberta: number }[]
  gruposNivel1: { numero: string; descricao: string }[]
  gruposNivel1Resumo: { numero: string; descricao: string }[]
  categoriasGrafico: Record<string, string>
  categoriasResumo: CategoriaResumoGrupo[]
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
  const [modelo, setModelo] = useState<ModeloAcrescimo>(modeloAcrescimo)
  const [taxaItens, setTaxaItens] = useState<TaxaAdministracaoItemForm[]>(
    taxaAdministracaoItens.map(it => ({ id: it.id, descricao: it.descricao, percentual: String(it.percentual) }))
  )
  const [servicos, setServicos] = useState<ServicoEstimadoForm[]>(
    servicosEstimados.map(s => ({ id: s.id, descricao: s.descricao, valor: String(s.valor) }))
  )
  const [pavimentosForm, setPavimentosForm] = useState<PavimentoForm[]>(
    pavimentos.map(p => ({
      id: p.id, descricao: p.descricao, unidade: p.unidade,
      area_total: String(p.area_total), area_equivalente: String(p.area_equivalente), area_coberta: String(p.area_coberta),
    }))
  )
  const [digitos, setDigitos] = useState<number[]>(numeracaoDigitos.length > 0 ? numeracaoDigitos : [1, 1, 1, 1])
  const [categorias, setCategorias] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const g of gruposNivel1) map[g.numero] = categoriasGrafico[g.numero] || sugerirCategoria(g.descricao)
    return map
  })
  const [categoriasResumoLista, setCategoriasResumoLista] = useState<CategoriaResumoForm[]>(
    categoriasResumo.map(c => ({ id: c.id, nome: c.nome }))
  )
  const [categoriasResumoAtribuicoes, setCategoriasResumoAtribuicoes] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const c of categoriasResumo) for (const numero of c.numeros) map[numero] = c.id
    return map
  })

  const [isPending, startTransition] = useTransition()
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<SectionId>('identificacao')
  const toast = useToast()

  function update(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setSalvo(false)
  }

  function updateModelo(value: ModeloAcrescimo) {
    setModelo(value)
    setSalvo(false)
  }

  function updateTaxaItens(itens: TaxaAdministracaoItemForm[]) {
    setTaxaItens(itens)
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

  function updatePavimento(index: number, field: keyof PavimentoForm, value: string) {
    setPavimentosForm(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
    setSalvo(false)
  }

  function addPavimento() {
    setPavimentosForm(prev => [...prev, { descricao: '', unidade: 'M2', area_total: '', area_equivalente: '', area_coberta: '' }])
    setSalvo(false)
  }

  function removePavimento(index: number) {
    setPavimentosForm(prev => prev.filter((_, i) => i !== index))
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

  function updateCategoriasResumoLista(next: CategoriaResumoForm[]) {
    setCategoriasResumoLista(next)
    setSalvo(false)
  }

  function updateCategoriasResumoAtribuicoes(next: Record<string, string>) {
    setCategoriasResumoAtribuicoes(next)
    setSalvo(false)
  }

  const exemploNumeracao = digitos.map((d, i) => String(i + 1).padStart(d, '0')).join('.')

  function handleSalvar() {
    setErro(null)
    if (!form.nome_obra.trim()) { setErro('Informe o nome da obra.'); return }
    // Fora do modo BDI, o percentual digitado é ignorado — o campo nem aparece.
    const bdi = parseFloat(form.bdi_global.replace(',', '.'))
    if (modelo === 'bdi' && (isNaN(bdi) || bdi < 0)) { setErro('BDI global inválido.'); return }

    // Mesmo raciocínio: só validamos/usamos os subgrupos quando o modelo
    // ativo realmente é Taxa de Administração — o editor nem aparece fora dele.
    const taxaItensValidos = taxaItens
      .map(it => ({ id: it.id, descricao: it.descricao.trim(), percentual: parseFloat(it.percentual.replace(',', '.')) }))
      .filter(it => it.descricao)
    if (modelo === 'taxa_administracao' && taxaItensValidos.some(it => isNaN(it.percentual) || it.percentual < 0)) {
      setErro('Percentual de Taxa de Administração inválido.'); return
    }

    const servicosValidos = servicos
      .map(s => ({ descricao: s.descricao.trim(), valor: parseFloat(s.valor.replace(',', '.')) || 0 }))
      .filter(s => s.descricao)

    const pavimentosValidos = pavimentosForm
      .map(p => ({
        id: p.id,
        descricao: p.descricao.trim(),
        unidade: p.unidade.trim() || 'M2',
        area_total: parseFloat(p.area_total.replace(',', '.')) || 0,
        area_equivalente: parseFloat(p.area_equivalente.replace(',', '.')) || 0,
        area_coberta: parseFloat(p.area_coberta.replace(',', '.')) || 0,
      }))
      .filter(p => p.descricao)

    // numeros de cada categoria vêm da ordem de gruposNivel1Resumo (já
    // ordenado por `ordem` da planilha), não de Object.entries(atribuicoes) —
    // cuja ordem de chave depende da ordem de clique do usuário, não do
    // numero do grupo. gruposNivel1Resumo (não gruposNivel1) porque esta
    // feature soma sobre arvoreCompleta — inclui grupos marcados como
    // estimado, diferente da lista usada pelo card "Distribuição de Custos".
    const categoriasResumoValidas = categoriasResumoLista
      .map(c => ({ id: c.id, nome: c.nome.trim() }))
      .filter(c => c.nome)
    const idsCategoriasResumoValidas = new Set(categoriasResumoValidas.map(c => c.id))
    const numerosPorCategoriaResumo = new Map<string, string[]>()
    for (const g of gruposNivel1Resumo) {
      const catId = categoriasResumoAtribuicoes[g.numero]
      if (!catId || !idsCategoriasResumoValidas.has(catId)) continue
      const arr = numerosPorCategoriaResumo.get(catId) ?? []
      arr.push(g.numero)
      numerosPorCategoriaResumo.set(catId, arr)
    }
    const categoriasResumoPayload: CategoriaResumoGrupo[] = categoriasResumoValidas.map(c => ({
      id: c.id,
      nome: c.nome,
      numeros: numerosPorCategoriaResumo.get(c.id) ?? [],
    }))

    startTransition(async () => {
      try {
        await salvarConfiguracoes(orcamentoId, {
          nome_obra: form.nome_obra.trim(),
          codigo: form.codigo.trim() || null,
          cliente: form.cliente.trim() || null,
          local: form.local.trim() || null,
          data: form.data,
          bdi_global: isNaN(bdi) ? 0 : bdi,
          modelo_acrescimo: modelo,
          taxa_administracao_itens: modelo === 'taxa_administracao' ? taxaItensValidos : [],
          area_total: form.area_total ? parseFloat(form.area_total.replace(',', '.')) : null,
          area_coberta: form.area_coberta ? parseFloat(form.area_coberta.replace(',', '.')) : null,
          area_equivalente: form.area_equivalente ? parseFloat(form.area_equivalente.replace(',', '.')) : null,
          numeracao_digitos: digitos,
          servicos_estimados: servicosValidos,
          categorias_grafico: categorias,
          categorias_resumo: categoriasResumoPayload,
          pavimentos: pavimentosValidos,
        })
        setSalvo(true)
        toast.show('Configurações salvas com sucesso.')
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : 'Não foi possível salvar as configurações. Tente novamente.'
        setErro(mensagem)
        toast.show(mensagem, 'error')
      }
    })
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <SectionNav active={activeSection} onChange={setActiveSection} />

      <div className="min-w-0 flex-1 space-y-6">
        {activeSection === 'identificacao' && (
          <SectionCard>
            <SectionHeader title="Identificação" description="Como esta obra é identificada no sistema e nos relatórios." />
            <div className="space-y-4">
              <Input label="Nome da obra" required value={form.nome_obra} onChange={e => update('nome_obra', e.target.value)} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Código" value={form.codigo} onChange={e => update('codigo', e.target.value)} />
                <Input type="date" label="Data" value={form.data} onChange={e => update('data', e.target.value)} />
              </div>
              <Input label="Local" value={form.local} onChange={e => update('local', e.target.value)} placeholder="Ex: Conceição do Pará - MG" />
              <Input label="Cliente" value={form.cliente} onChange={e => update('cliente', e.target.value)} placeholder="Ex: João Silva" />
            </div>
          </SectionCard>
        )}

        {activeSection === 'calculo' && (
          <SectionCard>
            <SectionHeader title="Cálculo e numeração" description="Como o acréscimo é aplicado sobre o custo direto e como a EAP é numerada." />
            <div className="space-y-4">
              <ModeloAcrescimoSelect value={modelo} onChange={updateModelo} />

              {modelo === 'bdi' && (
                <Input type="number" min="0" step="0.01" label="BDI global (%)" className="max-w-40" value={form.bdi_global} onChange={e => update('bdi_global', e.target.value)} />
              )}

              {modelo === 'taxa_administracao' && (
                <TaxaAdministracaoItensEditor itens={taxaItens} onChange={updateTaxaItens} />
              )}

              {modelo === 'sem_taxa' && (
                <p className="text-xs text-gray-400">
                  Nenhum acréscimo será aplicado sobre o custo direto deste orçamento.
                </p>
              )}
            </div>

            <div className="mt-6 border-t border-gray-100 pt-5 space-y-3">
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
          </SectionCard>
        )}

        {activeSection === 'areas' && (
          <SectionCard>
            <SectionHeader title="Áreas e pavimentos" description="Usado no Caderno de Orçamento (Resumo Geral e Custo/m²)." />

            <div className="grid grid-cols-3 gap-4">
              <Input type="number" min="0" step="0.01" label="Área total (m²)" value={form.area_total} onChange={e => update('area_total', e.target.value)} disabled={pavimentosForm.length > 0} />
              <Input type="number" min="0" step="0.01" label="Área coberta (m²)" value={form.area_coberta} onChange={e => update('area_coberta', e.target.value)} disabled={pavimentosForm.length > 0} />
              <Input type="number" min="0" step="0.01" label="Área equivalente (m²)" value={form.area_equivalente} onChange={e => update('area_equivalente', e.target.value)} disabled={pavimentosForm.length > 0} />
            </div>
            {pavimentosForm.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                Calculado automaticamente como a soma dos pavimentos abaixo — remova todos pra voltar a preencher manualmente.
              </p>
            )}

            <div className="space-y-2 border-t border-gray-100 mt-6 pt-5">
              <div>
                <label className={LABEL}>Pavimentos (opcional)</label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Detalha a área por pavimento na tabela &quot;Custo/m²&quot; do Caderno (ex.: &quot;Restaurante e Cozinha —
                  Áreas Cobertas&quot;, &quot;Pátios Externos — Áreas Descobertas&quot;). Se cadastrado, as áreas totais acima
                  passam a ser a soma automática destes pavimentos.
                </p>
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={addPavimento} className="flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline">
                  <Plus size={12} /> Adicionar pavimento
                </button>
              </div>
              {pavimentosForm.length === 0 && (
                <p className="text-xs text-gray-400">Nenhum pavimento cadastrado — usando as áreas totais preenchidas acima.</p>
              )}
              {pavimentosForm.map((p, i) => (
                <div key={p.id ?? `new-${i}`} className="grid grid-cols-[1fr_repeat(3,7rem)_auto] items-end gap-2">
                  <Input value={p.descricao} onChange={e => updatePavimento(i, 'descricao', e.target.value)}
                    placeholder="Ex: Restaurante e Cozinha - Áreas Cobertas" />
                  <Input type="number" min="0" step="0.01" value={p.area_total} onChange={e => updatePavimento(i, 'area_total', e.target.value)}
                    placeholder="Área total" />
                  <Input type="number" min="0" step="0.01" value={p.area_equivalente} onChange={e => updatePavimento(i, 'area_equivalente', e.target.value)}
                    placeholder="Área equiv." />
                  <Input type="number" min="0" step="0.01" value={p.area_coberta} onChange={e => updatePavimento(i, 'area_coberta', e.target.value)}
                    placeholder="Área coberta" />
                  <IconButton label="Remover pavimento" icon={<X size={14} />} variant="outline" onClick={() => removePavimento(i)} />
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {activeSection === 'estimados' && (
          <SectionCard>
            <SectionHeader
              title="Serviços estimados (B)"
              description="Itens sem correspondência na planilha, lançados manualmente no Total Estimado do Caderno."
            />
            <div className="space-y-2">
              <div className="flex justify-end">
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
          </SectionCard>
        )}

        {activeSection === 'grafico' && (
          <SectionCard>
            <SectionHeader
              title="Distribuição de custos"
              description={'Define em qual categoria do gráfico "Distribuição dos Custos (A)" do Caderno cada grupo de nível 1 da planilha entra. Grupos não ajustados usam uma sugestão automática.'}
            />

            {gruposNivel1.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhum grupo de nível 1 cadastrado na planilha.</p>
            ) : (
              <div className="space-y-1.5 max-h-[28rem] overflow-y-auto pr-1">
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
          </SectionCard>
        )}

        {activeSection === 'categorias' && (
          <SectionCard>
            <SectionHeader
              title="Categorias do Resumo Geral"
              description={'Agrupa os itens de nível 1 sob categorias macro na tabela "(A) Detalhamento dos Custos" do Caderno, cada uma com seu subtotal.'}
            />
            <CategoriasResumoEditor
              categorias={categoriasResumoLista}
              onChangeCategorias={updateCategoriasResumoLista}
              gruposNivel1={gruposNivel1Resumo}
              atribuicoes={categoriasResumoAtribuicoes}
              onChangeAtribuicoes={updateCategoriasResumoAtribuicoes}
            />
          </SectionCard>
        )}

        {/* Botão de salvar logo abaixo da seção ativa — como cada seção agora
            mostra só os campos dela (não os 6 cards inteiros de uma vez), a
            distância até aqui é bem menor do que na tela antiga (lei de
            Fitts): quase sempre 1 seção de rolagem, nunca a página toda. */}
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSalvar} loading={isPending}>
              Salvar configurações
            </Button>
            {erro && <span className="text-sm text-red-600">{erro}</span>}
            {!erro && salvo && <span className="text-sm text-emerald-600">Configurações salvas com sucesso.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
