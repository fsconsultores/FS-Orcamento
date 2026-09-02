/**
 * Filtros de negócio para gráficos do Caderno (camada de apresentação).
 */
import type { DistribuicaoCustoItem } from '@/lib/orcamento/caderno'

const EXCLUDED_TOP5_LABELS = new Set(['outros', 'diversos'])

function normalizeCategoryLabel(label: string): string {
  return label.trim().toLowerCase()
}

/** Exclui categorias-residual ("Outros", "Diversos") do ranking Top 5. */
export function filterRealCategoriesForTop5(
  distribuicao: DistribuicaoCustoItem[],
): DistribuicaoCustoItem[] {
  return distribuicao.filter(item => !EXCLUDED_TOP5_LABELS.has(normalizeCategoryLabel(item.label)))
}
