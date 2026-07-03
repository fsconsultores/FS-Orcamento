'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

interface Props {
  orcamentoId: string
}

const TABS = [
  { suffix: 'planilha', label: 'Planilha' },
  { suffix: 'insumos', label: 'Insumos' },
  { suffix: 'composicoes', label: 'Composições' },
  { suffix: 'relatorios', label: 'Relatórios' },
  { suffix: 'importar', label: 'Importar' },
  { suffix: 'configuracoes', label: 'Configurações' },
  { suffix: 'logs', label: 'Logs' },
]

function SubNavLinks({ orcamentoId }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const planilhaId = searchParams.get('planilha')
  const base = `/orcamentos/${orcamentoId}`

  return (
    <>
      {TABS.map(({ suffix, label }) => {
        const baseHref = suffix ? `${base}/${suffix}` : base
        // Preserva ?planilha= ao navegar entre abas para manter a planilha ativa
        const href = planilhaId ? `${baseHref}?planilha=${planilhaId}` : baseHref
        const active = suffix
          ? pathname.startsWith(`${base}/${suffix}`)
          : pathname === base

        return (
          <Link
            key={suffix}
            href={href as any}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {label}
          </Link>
        )
      })}
    </>
  )
}

export function OrcamentoSubNav({ orcamentoId }: Props) {
  const base = `/orcamentos/${orcamentoId}`
  const pathname = usePathname()

  // Na tela de listagem de planilhas (raiz do projeto), as abas ainda não
  // fazem sentido: elas só se aplicam depois que uma planilha é escolhida.
  if (pathname === base) return null

  return (
    <div className="flex gap-0 border-b border-gray-200 mb-6 -mt-2">
      <Suspense
        fallback={TABS.map(({ suffix, label }) => (
          <Link
            key={suffix}
            href={`${base}/${suffix}` as any}
            className="px-4 py-2.5 text-sm font-medium border-b-2 -mb-px border-transparent text-gray-500"
          >
            {label}
          </Link>
        ))}
      >
        <SubNavLinks orcamentoId={orcamentoId} />
      </Suspense>
    </div>
  )
}
