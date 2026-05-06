'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  orcamentoId: string
  orcamentoNome: string
}

const SEGMENT_LABELS: Record<string, string> = {
  insumos: 'Insumos',
  composicoes: 'Composições',
  editar: 'Editar',
}

export function OrcamentoBreadcrumb({ orcamentoId, orcamentoNome }: Props) {
  const pathname = usePathname()
  const base = `/orcamentos/${orcamentoId}` as any

  // Extrai o segmento após /orcamentos/[id]/  ex: "insumos", "composicoes", "editar" ou ""
  const suffix = pathname.replace(base, '').replace(/^\//, '').split('/')[0]
  const pageLabel = SEGMENT_LABELS[suffix]

  return (
    <nav aria-label="Navegação" className="flex items-center gap-1.5 text-sm text-gray-500 mb-4">
      <Link href="/orcamentos" className="hover:text-gray-900 transition-colors">
        Orçamentos
      </Link>

      <span className="text-gray-300">/</span>

      {pageLabel ? (
        <Link href={base} className="hover:text-gray-900 transition-colors">
          {orcamentoNome}
        </Link>
      ) : (
        <span className="text-gray-900 font-medium">{orcamentoNome}</span>
      )}

      {pageLabel && (
        <>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">{pageLabel}</span>
        </>
      )}
    </nav>
  )
}
