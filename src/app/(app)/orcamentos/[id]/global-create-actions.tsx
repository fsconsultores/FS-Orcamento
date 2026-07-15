'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createInsumo, createComposicao } from '@/lib/orcamento'
import type { CreateInsumoData, CreateComposicaoData } from '@/lib/orcamento'
import { Modal } from '@/components/ui/modal'

const GRUPOS = [
  { value: 'E',  label: 'E — Equipamento' },
  { value: 'H',  label: 'H — Mão de Obra' },
  { value: 'HH', label: 'HH — Mão de Obra Horista' },
  { value: 'M',  label: 'M — Material' },
  { value: 'N',  label: 'N — Material' },
  { value: 'O',  label: 'O — Material' },
  { value: 'P',  label: 'P — Material' },
  { value: 'Q',  label: 'Q — Material' },
  { value: 'R',  label: 'R — Material' },
  { value: 'S',  label: 'S — Serviço de Terceiros' },
  { value: 'T',  label: 'T — Transporte' },
]

const inp = 'w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500'

const emptyInsumo = (): CreateInsumoData => ({
  composicao_id: null,
  codigo: '',
  descricao: '',
  unidade: '',
  custo: 0,
  indice: 1,
  grupo: null,
  base: null,
  data_ref: null,
})

const emptyComposicao = (): CreateComposicaoData => ({
  codigo: '',
  descricao: '',
  unidade: '',
  base: null,
})

// Botões globais "Novo Insumo" / "Nova Composição" — vivem no layout do
// orçamento (não em cada página) para poderem ser usados em qualquer aba do
// projeto, com atalhos de teclado F2/F4 sempre ativos.
export function GlobalCreateActions({ orcamentoId }: { orcamentoId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [insumoOpen, setInsumoOpen] = useState(false)
  const [insumoForm, setInsumoForm] = useState<CreateInsumoData>(emptyInsumo)
  const [insumoLoading, setInsumoLoading] = useState(false)
  const [insumoError, setInsumoError] = useState<string | null>(null)

  const [composicaoOpen, setComposicaoOpen] = useState(false)
  const [compForm, setCompForm] = useState<CreateComposicaoData>(emptyComposicao)
  const [compLoading, setCompLoading] = useState(false)
  const [compError, setCompError] = useState<string | null>(null)

  const [composicoes, setComposicoes] = useState<{ id: string; codigo: string; descricao: string }[]>([])
  const [composicoesCarregadas, setComposicoesCarregadas] = useState(false)

  // Atalhos globais: F2 abre Novo Insumo, F4 abre Nova Composição — em
  // qualquer aba do projeto, não só nas telas de Insumos/Composições.
  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      if (e.repeat) return
      if (e.key === 'F2') { e.preventDefault(); setInsumoOpen(true) }
      else if (e.key === 'F4') { e.preventDefault(); setComposicaoOpen(true) }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  // Carrega a lista de composições (p/ "Composição pai") só quando o modal de
  // insumo é aberto pela 1ª vez — evita uma query extra em toda navegação.
  useEffect(() => {
    if (!insumoOpen || composicoesCarregadas) return
    const sb = createClient() as any
    sb.from('orcamento_composicoes')
      .select('id, codigo, descricao')
      .eq('orcamento_id', orcamentoId)
      .order('codigo')
      .then(({ data }: any) => {
        setComposicoes(data ?? [])
        setComposicoesCarregadas(true)
      })
  }, [insumoOpen, composicoesCarregadas, orcamentoId])

  function closeInsumo() {
    setInsumoOpen(false)
    setInsumoForm(emptyInsumo())
    setInsumoError(null)
  }

  function closeComposicao() {
    setComposicaoOpen(false)
    setCompForm(emptyComposicao())
    setCompError(null)
  }

  async function handleSubmitInsumo(e: React.FormEvent) {
    e.preventDefault()
    setInsumoLoading(true)
    setInsumoError(null)
    try {
      const supabase = createClient()
      await createInsumo(supabase as any, orcamentoId, insumoForm)
      closeInsumo()
      startTransition(() => router.refresh())
    } catch (err) {
      setInsumoError(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setInsumoLoading(false)
    }
  }

  async function handleSubmitComposicao(e: React.FormEvent) {
    e.preventDefault()
    setCompLoading(true)
    setCompError(null)
    try {
      const supabase = createClient()
      const nova = await createComposicao(supabase as any, orcamentoId, compForm)
      closeComposicao()
      startTransition(() => {
        router.push(`/orcamentos/${orcamentoId}/composicoes/${nova.id}?addItem=1` as any)
      })
    } catch (err) {
      setCompError(err instanceof Error ? err.message : 'Erro inesperado')
      setCompLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setInsumoOpen(true)}
          title="Novo Insumo (F2)"
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Plus size={12} /> Insumo <span className="text-gray-400">F2</span>
        </button>
        <button
          onClick={() => setComposicaoOpen(true)}
          title="Nova Composição (F4)"
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <Plus size={12} /> Composição <span className="text-gray-400">F4</span>
        </button>
      </div>

      <Modal
        open={insumoOpen}
        onClose={closeInsumo}
        title="Novo Insumo"
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={closeInsumo}
              className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="global-novo-insumo-form"
              disabled={insumoLoading}
              className="rounded-md bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
            >
              {insumoLoading ? 'Salvando...' : 'Salvar Insumo'}
            </button>
          </>
        }
      >
        <form id="global-novo-insumo-form" onSubmit={handleSubmitInsumo} className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Código *</label>
              <input
                required
                autoFocus
                value={insumoForm.codigo}
                onChange={(e) => setInsumoForm(p => ({ ...p, codigo: e.target.value }))}
                className={inp}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Descrição *</label>
              <input
                required
                value={insumoForm.descricao}
                onChange={(e) => setInsumoForm(p => ({ ...p, descricao: e.target.value }))}
                className={inp}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Unidade *</label>
              <input
                required
                value={insumoForm.unidade}
                onChange={(e) => setInsumoForm(p => ({ ...p, unidade: e.target.value }))}
                className={inp}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Custo *</label>
              <input
                required
                type="number"
                step="0.0001"
                min="0"
                value={insumoForm.custo}
                onChange={(e) => setInsumoForm(p => ({ ...p, custo: parseFloat(e.target.value) || 0 }))}
                className={inp}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Grupo</label>
              <select
                value={insumoForm.grupo ?? ''}
                onChange={(e) => setInsumoForm(p => ({ ...p, grupo: e.target.value || null }))}
                className={inp}
              >
                <option value="">— Selecione —</option>
                {GRUPOS.map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Base</label>
              <input
                value={insumoForm.base ?? ''}
                onChange={(e) => setInsumoForm(p => ({ ...p, base: e.target.value || null }))}
                className={inp}
              />
            </div>

            {composicoes.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Composição pai</label>
                <select
                  value={insumoForm.composicao_id ?? ''}
                  onChange={(e) => setInsumoForm(p => ({ ...p, composicao_id: e.target.value || null }))}
                  className={inp}
                >
                  <option value="">— Nenhuma (insumo avulso) —</option>
                  {composicoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} — {c.descricao}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {insumoError && <p className="text-sm text-red-600">{insumoError}</p>}
        </form>
      </Modal>

      <Modal
        open={composicaoOpen}
        onClose={closeComposicao}
        title="Nova Composição"
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={closeComposicao}
              className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="global-nova-composicao-form"
              disabled={compLoading}
              className="rounded-md bg-primary-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
            >
              {compLoading ? 'Salvando...' : 'Salvar e adicionar insumos →'}
            </button>
          </>
        }
      >
        <form id="global-nova-composicao-form" onSubmit={handleSubmitComposicao} className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Código *</label>
            <input
              required
              autoFocus
              value={compForm.codigo}
              onChange={(e) => setCompForm(p => ({ ...p, codigo: e.target.value }))}
              className={inp}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Unidade *</label>
            <input
              required
              value={compForm.unidade}
              onChange={(e) => setCompForm(p => ({ ...p, unidade: e.target.value }))}
              className={inp}
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Descrição *</label>
            <input
              required
              value={compForm.descricao}
              onChange={(e) => setCompForm(p => ({ ...p, descricao: e.target.value }))}
              className={inp}
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">Base</label>
            <input
              value={compForm.base ?? ''}
              onChange={(e) => setCompForm(p => ({ ...p, base: e.target.value || null }))}
              className={inp}
            />
          </div>

          {compError && <p className="col-span-2 text-sm text-red-600">{compError}</p>}
        </form>
      </Modal>
    </>
  )
}
