'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Tabs, type TabItem } from '@/components/ui/tabs'

interface Props {
  orcamentoId: string
}

const TABS = [
  { suffix: 'planilha', label: 'Planilha' },
  { suffix: 'insumos', label: 'Insumos' },
  { suffix: 'composicoes', label: 'Composições' },
  { suffix: 'relatorios', label: 'Relatórios' },
  { suffix: 'curva-abc', label: 'Curva ABC' },
  { suffix: 'versoes', label: 'Versões' },
  { suffix: 'importar', label: 'Importar' },
  { suffix: 'configuracoes', label: 'Configurações' },
  { suffix: 'logs', label: 'Logs' },
]

function SubNavLinks({ orcamentoId }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const planilhaId = searchParams.get('planilha')
  const base = `/orcamentos/${orcamentoId}`

  const items: TabItem[] = TABS.map(({ suffix, label }) => {
    const baseHref = `${base}/${suffix}`
    // Preserva ?planilha= ao navegar entre abas para manter a planilha ativa
    const href = planilhaId ? `${baseHref}?planilha=${planilhaId}` : baseHref
    return { key: suffix, label, href, active: pathname.startsWith(baseHref) }
  })

  return <Tabs items={items} className="mb-6 -mt-2" />
}

export function OrcamentoSubNav({ orcamentoId }: Props) {
  const base = `/orcamentos/${orcamentoId}`
  const pathname = usePathname()

  // Na tela de listagem de planilhas (raiz do projeto), as abas ainda não
  // fazem sentido: elas só se aplicam depois que uma planilha é escolhida.
  if (pathname === base) return null

  const fallbackItems: TabItem[] = TABS.map(({ suffix, label }) => ({
    key: suffix, label, href: `${base}/${suffix}`, active: false,
  }))

  return (
    <Suspense fallback={<Tabs items={fallbackItems} className="mb-6 -mt-2" />}>
      <SubNavLinks orcamentoId={orcamentoId} />
    </Suspense>
  )
}
