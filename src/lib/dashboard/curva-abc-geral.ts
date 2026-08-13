import { calcularCurvaAbc, classificarCategoriaAbc, type AbcItem } from '@/lib/curva-abc'
import type { EstruturaItemResumo, InsumoAvulsoResumo, HistoricoPrecoResumo } from './queries'

export interface AbcItemGeral extends AbcItem {
  orcamento_id: string
  orcamento_nome: string
}

/**
 * Curva ABC Geral: agrega itens de planilha (`orcamento_estrutura`,
 * `tipo='item'`) de TODOS os orçamentos do usuário, usando o
 * `quantidade × custo_unitario` já calculado e persistido em cada linha —
 * sem decompor sub-composições recursivamente (isso é o que a Curva ABC
 * por-projeto já faz, caro demais para rodar em todos os orçamentos a cada
 * abertura da dashboard). Por isso é "por item de planilha", não "por
 * insumo consolidado": dois itens de orçamentos diferentes que usam o mesmo
 * insumo não se combinam em uma única linha.
 *
 * `nomesPorOrcamento` é opcional (o card resumido da dashboard não precisa
 * dela, só a rota /curva-abc completa, que exibe de qual orçamento cada
 * item veio) — `calcularCurvaAbc` preserva campos extras via spread mesmo
 * sem eles fazerem parte do tipo `AbcItem`.
 */
export function computeCurvaAbcGeral(
  itens: EstruturaItemResumo[],
  nomesPorOrcamento: Map<string, string> = new Map()
): AbcItemGeral[] {
  return calcularCurvaAbc(
    itens.map(i => ({
      codigo: i.codigo,
      descricao: i.descricao,
      unidade: i.unidade,
      quantidade: i.quantidade,
      custo_unitario: i.custo_unitario,
      orcamento_id: i.orcamento_id,
      orcamento_nome: nomesPorOrcamento.get(i.orcamento_id) ?? '—',
    }))
  ) as AbcItemGeral[]
}

export interface ResumoClasseAbc {
  classe: 'A' | 'B' | 'C'
  quantidade: number
  percentualFinanceiro: number
}

/** Contagem de itens + % financeiro por classe — o que o card do dashboard exibe. */
export function resumoPorClasse(items: AbcItem[]): ResumoClasseAbc[] {
  return (['A', 'B', 'C'] as const).map(classe => {
    const doGrupo = items.filter(i => i.classe === classe)
    return {
      classe,
      quantidade: doGrupo.length,
      percentualFinanceiro: doGrupo.reduce((s, i) => s + i.percentual, 0),
    }
  })
}

export interface CategoriaPorProjeto {
  orcamentoId: string
  orcamentoNome: string
  materiais: number
  equipamentos: number
  /** Já inclui mão de obra — mesma convenção de exibição de resumo-sistema.tsx
   * (3 categorias visíveis: Materiais/Equipamentos/Serviços). */
  servicos: number
  total: number
}

/**
 * Preço de insumo por categoria, agrupado por projeto — alimenta o widget
 * "Insumos por categoria, por obra" do dashboard. Soma só insumos AVULSOS
 * (ver getInsumosAvulsosResumo): cada insumo entra uma única vez por
 * projeto, então não é "quanto a categoria custa na planilha final"
 * (precisaria decompor composições recursivamente, como computeAbcCurvaUnica
 * já faz por-projeto) — é uma aproximação barata o suficiente pra rodar em
 * todos os projetos de uma vez, mesmo princípio de computeCurvaAbcGeral.
 */
export function computeInsumosPorCategoria(
  insumos: InsumoAvulsoResumo[],
  nomesPorOrcamento: Map<string, string>
): CategoriaPorProjeto[] {
  const porProjeto = new Map<string, CategoriaPorProjeto>()
  for (const i of insumos) {
    let acc = porProjeto.get(i.orcamento_id)
    if (!acc) {
      acc = {
        orcamentoId: i.orcamento_id,
        orcamentoNome: nomesPorOrcamento.get(i.orcamento_id) ?? '—',
        materiais: 0,
        equipamentos: 0,
        servicos: 0,
        total: 0,
      }
      porProjeto.set(i.orcamento_id, acc)
    }
    const categoria = classificarCategoriaAbc(i.grupo)
    const custo = i.custo ?? 0
    if (categoria === 'equipamentos') acc.equipamentos += custo
    else if (categoria === 'materiais') acc.materiais += custo
    else acc.servicos += custo // mao_de_obra + servicos
    acc.total += custo
  }
  return [...porProjeto.values()]
}

export interface VariacaoPreco {
  orcamentoId: string
  orcamentoNome: string
  codigo: string
  precoAnterior: number
  precoNovo: number
  variacaoPct: number
  criadoEm: string
}

/**
 * Ranking dos insumos com maior variação de preço (edição manual), cross-
 * obra — alimenta o widget "Maiores variações de preço" do dashboard. Só a
 * edição mais recente por (orcamento_id, codigo) entra no ranking (evita
 * repetir o mesmo insumo várias vezes se ele foi editado mais de uma vez);
 * `historico` precisa vir ordenado created_at desc (ver
 * getHistoricoPrecosResumo) pra "a primeira que aparecer" ser a mais
 * recente.
 */
export function computeMaioresVariacoes(
  historico: HistoricoPrecoResumo[],
  nomesPorOrcamento: Map<string, string>,
  limite = 8
): VariacaoPreco[] {
  const maisRecentePorChave = new Map<string, HistoricoPrecoResumo>()
  for (const h of historico) {
    if (!h.preco_anterior) continue
    const chave = `${h.orcamento_id}|${h.codigo}`
    if (!maisRecentePorChave.has(chave)) maisRecentePorChave.set(chave, h)
  }
  return [...maisRecentePorChave.values()]
    .map(h => ({
      orcamentoId: h.orcamento_id,
      orcamentoNome: nomesPorOrcamento.get(h.orcamento_id) ?? '—',
      codigo: h.codigo,
      precoAnterior: h.preco_anterior!,
      precoNovo: h.preco_novo,
      variacaoPct: ((h.preco_novo - h.preco_anterior!) / h.preco_anterior!) * 100,
      criadoEm: h.created_at,
    }))
    .sort((a, b) => Math.abs(b.variacaoPct) - Math.abs(a.variacaoPct))
    .slice(0, limite)
}
