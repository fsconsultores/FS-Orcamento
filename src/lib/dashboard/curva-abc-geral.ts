import { calcularCurvaAbc, type AbcItem } from '@/lib/curva-abc'
import type { EstruturaItemResumo } from './queries'

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
