'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  orcamentoId: string
  orcamentoNome: string
}

const SEGMENT_LABELS: Record<string, string> = {
  planilha: 'Planilha',
  insumos: 'Insumos',
  composicoes: 'Composições',
  relatorios: 'Relatórios',
  importar: 'Importar',
  configuracoes: 'Configurações',
  logs: 'Logs',
  editar: 'Editar',
}

export function OrcamentoBreadcrumb({ orcamentoId, orcamentoNome }: Props) {
  const pathname = usePathname()
  const base = `/orcamentos/${orcamentoId}` as any

  // Extrai o segmento após /orcamentos/[id]/  ex: "insumos", "composicoes", "editar" ou ""
  const suffix = pathname.replace(base, '').replace(/^\//, '').split('/')[0]
  const pageLabel = SEGMENT_LABELS[suffix]

  return (
    <nav aria-label="Navegação" className="mb-4 flex items-center gap-1.5 text-sm text-gray-500">
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
    </nav>
  )
}
