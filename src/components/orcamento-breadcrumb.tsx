'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  orcamentoId: string
  orcamentoNome: string
  /** Indicador "Revisão N de M" — ver RevisaoIndicator em layout.tsx. Fica
   * colado no nome do orçamento (não em `actions`) porque é identidade da
   * página, não uma ação, e precisa estar visível em toda navegação entre
   * abas pra evitar o exato tipo de confusão que motivou construir isso:
   * editar algo numa revisão sem perceber que não é a que se pretendia. */
  badge?: ReactNode
  actions?: ReactNode
}

const SEGMENT_LABELS: Record<string, string> = {
  planilha: 'Planilha',
  insumos: 'Insumos',
  composicoes: 'Composições',
  'curva-abc': 'Curva ABC',
  estimados: 'Estimados',
  relatorios: 'Relatórios',
  caderno: 'Caderno',
  importar: 'Importar',
  versoes: 'Revisões',
  configuracoes: 'Configurações',
  logs: 'Logs',
  editar: 'Editar',
  levantamentos: 'Levantamentos',
}

export function OrcamentoBreadcrumb({ orcamentoId, orcamentoNome, badge, actions }: Props) {
  const pathname = usePathname()
  const base = `/orcamentos/${orcamentoId}` as any

  // Extrai o segmento após /orcamentos/[id]/  ex: "insumos", "composicoes", "editar" ou ""
  const suffix = pathname.replace(base, '').replace(/^\//, '').split('/')[0]
  const pageLabel = SEGMENT_LABELS[suffix]

  return (
    <nav aria-label="Navegação" className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/orcamentos" className="transition-colors hover:text-primary-700">
          Orçamentos
        </Link>

        <span className="text-gray-300">/</span>

        {pageLabel ? (
          <Link href={base} className="transition-colors hover:text-primary-700">
            {orcamentoNome}
          </Link>
        ) : (
          <span className="font-medium text-gray-900">{orcamentoNome}</span>
        )}

        {pageLabel && (
          <>
            <span className="text-gray-300">/</span>
            <span className="font-medium text-gray-900">{pageLabel}</span>
          </>
        )}
        {badge}
      </div>
      {actions}
    </nav>
  )
}
