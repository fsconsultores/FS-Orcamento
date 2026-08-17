'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import type { ServicoComInsumoEstimado } from '@/lib/orcamento/caderno'
import { fmt } from '@/lib/curva-abc'

const SEM_PLANILHA = '__sem_planilha__'

interface Props {
  open: boolean
  onClose: () => void
  servicos: ServicoComInsumoEstimado[]
  /** IDs (orcamento_estrutura.id) marcados para NÃO aparecer no Caderno — tudo que não está aqui aparece (default). */
  ocultosIds: Set<string>
  onChange: (novo: Set<string>) => void
}

/**
 * Escolha de quais serviços com insumo estimado aparecem na seção "(B)
 * Serviços Estimados" DESTA exportação — nunca salva no orçamento, é
 * estado local da tela de Relatórios (ver report-detail-panel.tsx). A
 * detecção em si (quem tem insumo estimado) continua 100% automática.
 */
export function ServicosEstimadosModal({ open, onClose, servicos, ocultosIds, onChange }: Props) {
  const [busca, setBusca] = useState('')
  const [planilhaFiltro, setPlanilhaFiltro] = useState('todas')

  const planilhasOpcoes = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of servicos) map.set(s.planilhaId ?? SEM_PLANILHA, s.planilhaNome)
    return [...map.entries()]
  }, [servicos])

  const filtrados = useMemo(() => {
    const buscaNorm = busca.trim().toLowerCase()
    return servicos.filter(s => {
      if (planilhaFiltro !== 'todas' && (s.planilhaId ?? SEM_PLANILHA) !== planilhaFiltro) return false
      if (buscaNorm && !s.descricao.toLowerCase().includes(buscaNorm)) return false
      return true
    })
  }, [servicos, busca, planilhaFiltro])

  const qtdSelecionados = servicos.length - ocultosIds.size

  function toggle(id: string) {
    const next = new Set(ocultosIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  function marcarTodos(exibir: boolean) {
    const next = new Set(ocultosIds)
    for (const s of filtrados) {
      if (exibir) next.delete(s.id)
      else next.add(s.id)
    }
    onChange(next)
  }

  return (
    <Modal open={open} onClose={onClose} title="Serviços com Preços Estimados" size="lg"
      footer={<Button onClick={onClose}>Concluído</Button>}
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Serviços detectados automaticamente por usar algum insumo com preço estimado. Escolha quais devem
          aparecer na seção &quot;(B) Serviços Estimados&quot; deste Caderno — a detecção em si continua 100% automática.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por descrição..."
            className="flex-1 min-w-[200px] max-w-xs rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          />
          {planilhasOpcoes.length > 1 && (
            <select
              value={planilhaFiltro}
              onChange={e => setPlanilhaFiltro(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            >
              <option value="todas">Todas as planilhas</option>
              {planilhasOpcoes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2 whitespace-nowrap">
            <button type="button" onClick={() => marcarTodos(true)} className="text-xs font-medium text-primary-700 hover:underline">
              Marcar todos
            </button>
            <span className="text-gray-300">·</span>
            <button type="button" onClick={() => marcarTodos(false)} className="text-xs font-medium text-primary-700 hover:underline">
              Desmarcar todos
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500">
          {qtdSelecionados} de {servicos.length} serviço(s) selecionado(s) para exibição
        </p>

        {filtrados.length === 0 ? (
          <div className="rounded-lg border border-gray-200 py-8">
            <EmptyState
              title={servicos.length === 0 ? 'Nenhum serviço com insumo estimado' : 'Nenhum serviço encontrado'}
              description={servicos.length === 0
                ? 'Nenhum insumo deste orçamento está com preço marcado como estimado na cotação.'
                : 'Ajuste a busca ou o filtro de planilha.'}
            />
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <Thead>
                <Th>Planilha</Th>
                <Th>Caminho</Th>
                <Th className="text-right">Valor</Th>
                <Th className="text-center">Insumos</Th>
                <Th className="text-center">Exibir</Th>
              </Thead>
              <Tbody>
                {filtrados.map(s => (
                  <Tr key={s.id}>
                    <Td className="text-gray-600">{s.planilhaNome}</Td>
                    <Td className="text-gray-900">
                      {s.itemPaiDescricao && <span className="text-gray-400">{s.itemPaiDescricao} &gt; </span>}
                      {s.descricao}
                    </Td>
                    <Td className="text-right tabular-nums font-medium text-gray-900">{fmt(s.valor)}</Td>
                    <Td className="text-center tabular-nums text-gray-700">{s.qtdInsumosEstimados}</Td>
                    <Td className="text-center">
                      <input
                        type="checkbox"
                        checked={!ocultosIds.has(s.id)}
                        onChange={() => toggle(s.id)}
                        className="h-4 w-4 accent-primary-600 cursor-pointer"
                      />
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        )}
      </div>
    </Modal>
  )
}
