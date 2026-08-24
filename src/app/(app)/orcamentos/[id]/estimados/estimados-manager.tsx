'use client'

import { useMemo, useState } from 'react'
import type { CadernoNode } from '@/lib/orcamento/caderno'
import { atualizarItensEstimadosAction, type AlteracaoEstimado } from './estimados-action'
import { formatCurrency } from '@/lib/costs'
import { HighlightMatch } from '@/components/ui/highlight-match'

// Mesma ideia do antigo sufixo "- Estimado" no nome, só que agora é só uma
// SUGESTÃO de partida (pré-marcada), nunca a decisão em si — quem decide de
// verdade é sempre o orçamentista, salvando explicitamente. Cobre as variações
// de texto encontradas em planilhas reais (não só "estimado").
const SUGESTAO_RE = /-\s*(estimados?|a\s*definir|à\s*definir|aguardando\s+defini[cç][aã]o|pendente\s+defini[cç][aã]o)\b/i

interface Linha {
  node: CadernoNode
  depth: number
}

function achatar(nodes: CadernoNode[], depth = 0, out: Linha[] = []): Linha[] {
  for (const n of nodes) {
    out.push({ node: n, depth })
    achatar(n.filhos, depth + 1, out)
  }
  return out
}

const fmt = formatCurrency

interface EstadoItem {
  estimado: boolean
  motivo: string
  /** Texto bruto do input — vazio = sem override, usa o total calculado da planilha (node.total). */
  valor: string
}

function parseValor(raw: string): number | null {
  const str = raw.trim().replace(',', '.')
  if (str === '') return null
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

export function EstimadosManager({ orcamentoId, arvore, totalGeral }: { orcamentoId: string; arvore: CadernoNode[]; totalGeral: number }) {
  const linhas = useMemo(() => achatar(arvore), [arvore])

  // Estado inicial: reflete o que já está salvo (raw.estimado) — exceto pra
  // itens nunca configurados (estimado=false) cujo nome bate com o padrão de
  // sugestão, que começam pré-marcados (mas ainda não salvos) pra facilitar a
  // primeira revisão. Uma vez que o orçamentista salva, a sugestão de nome
  // não é mais consultada — só o que está no banco.
  const estadoInicial = useMemo(() => {
    const m = new Map<string, EstadoItem>()
    for (const { node } of linhas) {
      const sugerido = !node.estimado && SUGESTAO_RE.test(node.descricao)
      m.set(node.id, {
        estimado: node.estimado || sugerido,
        motivo: node.estimado_motivo ?? '',
        valor: node.valor_estimado != null ? String(node.valor_estimado) : '',
      })
    }
    return m
  }, [linhas])

  const [estado, setEstado] = useState(estadoInicial)
  const [query, setQuery] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const linhasVisiveis = q
    ? linhas.filter(({ node }) => node.descricao.toLowerCase().includes(q) || node.numero.toLowerCase().includes(q) || (node.codigo ?? '').toLowerCase().includes(q))
    : linhas

  const houveMudanca = useMemo(() => {
    for (const { node } of linhas) {
      const atual = estado.get(node.id)
      const salvo = { estimado: node.estimado, motivo: node.estimado_motivo ?? '', valor: node.valor_estimado }
      if (!atual) continue
      if (atual.estimado !== salvo.estimado) return true
      if (atual.estimado && atual.motivo.trim() !== salvo.motivo.trim()) return true
      if (atual.estimado && parseValor(atual.valor) !== salvo.valor) return true
    }
    return false
  }, [estado, linhas])

  // sumLeaves já vem embutido no `total`/`totalComBdi` de cada nó (soma dos
  // filhos) — pra não contar duas vezes quando um grupo E um filho dele estão
  // marcados, soma só os nós marcados que não têm ancestral também marcado.
  // Usa o valor editado (override) quando presente, senão o total calculado
  // com BDI — mesma regra de getCadernoData(). O override é digitado sem BDI
  // (é isso que o placeholder do campo mostra, node.total), então precisa da
  // mesma conversão pra "com BDI" antes de somar, senão esse preview não bate
  // com o que a "(B) Serviços Estimados" do Caderno realmente mostra.
  const totalEstimado = useMemo(() => {
    const marcados = new Set([...estado.entries()].filter(([, v]) => v.estimado).map(([id]) => id))
    let soma = 0
    function percorrer(nodes: CadernoNode[], ancestralMarcado: boolean) {
      for (const n of nodes) {
        const marcadoAqui = marcados.has(n.id)
        if (marcadoAqui && !ancestralMarcado) {
          const override = parseValor(estado.get(n.id)?.valor ?? '')
          soma += override != null
            ? (n.total > 0 ? override * (n.totalComBdi / n.total) : override)
            : n.totalComBdi
        }
        percorrer(n.filhos, ancestralMarcado || marcadoAqui)
      }
    }
    percorrer(arvore, false)
    return soma
  }, [estado, arvore])

  function toggle(id: string) {
    setEstado(prev => {
      const next = new Map(prev)
      const atual = next.get(id)
      if (atual) next.set(id, { ...atual, estimado: !atual.estimado })
      return next
    })
  }

  function setMotivo(id: string, motivo: string) {
    setEstado(prev => {
      const next = new Map(prev)
      const atual = next.get(id)
      if (atual) next.set(id, { ...atual, motivo })
      return next
    })
  }

  function setValor(id: string, valor: string) {
    setEstado(prev => {
      const next = new Map(prev)
      const atual = next.get(id)
      if (atual) next.set(id, { ...atual, valor })
      return next
    })
  }

  async function salvar() {
    setSalvando(true)
    setMensagem(null)
    const alteracoes: AlteracaoEstimado[] = []
    for (const { node } of linhas) {
      const atual = estado.get(node.id)
      if (!atual) continue
      const salvo = { estimado: node.estimado, motivo: node.estimado_motivo ?? '', valor: node.valor_estimado }
      const valorAtual = parseValor(atual.valor)
      if (atual.estimado !== salvo.estimado
        || (atual.estimado && atual.motivo.trim() !== salvo.motivo.trim())
        || (atual.estimado && valorAtual !== salvo.valor)) {
        alteracoes.push({ id: node.id, estimado: atual.estimado, motivo: atual.motivo.trim() || null, valorEstimado: atual.estimado ? valorAtual : null })
      }
    }
    try {
      await atualizarItensEstimadosAction(orcamentoId, alteracoes)
      setMensagem(`${alteracoes.length} item(ns) salvo(s) com sucesso.`)
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
        <p className="text-sm text-amber-900">
          Marque quais itens ou grupos da planilha devem aparecer em <strong>"(B) Serviços Estimados"</strong> no
          Caderno de Orçamento (e demais relatórios), em vez de compor o Total Orçado (A). Itens já marcados abaixo
          vieram de uma decisão salva anteriormente; itens com o ícone <span className="font-medium">"sugestão"</span> foram
          pré-marcados porque o nome parece indicar algo pendente — revise antes de salvar. Para um item marcado, o
          campo <span className="font-medium">Valor</span> fica editável: informe sua melhor estimativa (deixe em
          branco para usar o valor calculado da planilha) — isso não altera a planilha em si, só o que aparece no
          relatório de Serviços Estimados.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <span className="text-amber-900">Total estimado selecionado: <strong>{fmt(totalEstimado)}</strong></span>
          <span className="text-amber-700">Total geral da planilha: {fmt(totalGeral)}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="search"
          placeholder="Buscar por número, código ou descrição..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 min-w-[300px] max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
        <button
          onClick={salvar}
          disabled={!houveMudanca || salvando}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {salvando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
      {mensagem && <p className="text-sm text-gray-600">{mensagem}</p>}

      <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-22rem)] rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2.5 w-10" />
              <th className="px-3 py-2.5">Item</th>
              <th className="px-3 py-2.5">Descrição</th>
              <th className="px-3 py-2.5 text-right">Valor</th>
              <th className="px-3 py-2.5">Motivo (opcional)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {linhasVisiveis.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-gray-400">Nenhum item encontrado.</td></tr>
            ) : linhasVisiveis.map(({ node, depth }) => {
              const item = estado.get(node.id)
              const salvo = node.estimado
              const ehSugestao = !salvo && item?.estimado
              return (
                <tr key={node.id} className={item?.estimado ? 'bg-amber-50/40' : undefined}>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={item?.estimado ?? false}
                      onChange={() => toggle(node.id)}
                      className="h-4 w-4 accent-amber-500 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap"><HighlightMatch text={node.numero} query={query} /></td>
                  <td className="px-3 py-2 text-gray-800">
                    <span style={{ paddingLeft: depth * 16 }}><HighlightMatch text={node.descricao} query={query} /></span>
                    {ehSugestao && (
                      <span className="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">sugestão</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                    {item?.estimado ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={fmt(node.total)}
                        value={item.valor}
                        onChange={e => setValor(node.id, e.target.value)}
                        title="Deixe em branco para usar o valor calculado da planilha"
                        className="w-32 rounded border border-gray-200 px-2 py-1 text-right text-xs outline-none focus:border-amber-400"
                      />
                    ) : fmt(node.total)}
                  </td>
                  <td className="px-3 py-2">
                    {item?.estimado && (
                      <input
                        type="text"
                        placeholder="Ex.: aguardando definição do cliente"
                        value={item.motivo}
                        onChange={e => setMotivo(node.id, e.target.value)}
                        className="w-full rounded border border-gray-200 px-2 py-1 text-xs outline-none focus:border-amber-400"
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
