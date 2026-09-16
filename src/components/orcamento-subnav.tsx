'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { Tabs, type TabItem } from '@/components/ui/tabs'

interface Props {
  orcamentoId: string
}

// newGroup marca o 1º item de um cluster visual (Trabalho / Saída /
// Administração) — puramente cosmético (uma divisória fina antes do item),
// não muda href, ordem nem comportamento de clique de nenhuma aba. 10 abas
// simultâneas é lei de Hick em nível de navegação, mas reordenar ou esconder
// abas atrás de "mais" mudaria o hábito de quem já navega o sistema todo
// dia — o chunking visual reduz o custo de escanear sem esse risco.
const TABS = [
  { suffix: 'planilha', label: 'Planilha' },
  // 'levantamentos' propositalmente fora da nav — feature construída e
  // funcional (schema + página em /orcamentos/[id]/levantamentos), mas
  // usuário decidiu adiar/engavetar por ora. Ver memória
  // project_levantamentos_engavetado — reativar é só devolver esta linha.
  { suffix: 'insumos', label: 'Insumos' },
  { suffix: 'composicoes', label: 'Composições' },
  { suffix: 'curva-abc', label: 'Curva ABC' },
  { suffix: 'estimados', label: 'Estimados' },
  { suffix: 'relatorios', label: 'Relatórios', newGroup: true },
  { suffix: 'importar', label: 'Importar' },
  { suffix: 'versoes', label: 'Revisões', newGroup: true },
  { suffix: 'configuracoes', label: 'Configurações' },
  { suffix: 'logs', label: 'Logs' },
]

function SubNavLinks({ orcamentoId }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const planilhaId = searchParams.get('planilha')
  const base = `/orcamentos/${orcamentoId}`

  const items: TabItem[] = TABS.map(({ suffix, label, newGroup }) => {
    const baseHref = `${base}/${suffix}`
    // Preserva ?planilha= ao navegar entre abas para manter a planilha ativa
    const href = planilhaId ? `${baseHref}?planilha=${planilhaId}` : baseHref
    return { key: suffix, label, href, active: pathname.startsWith(baseHref), newGroup }
  })

  return <Tabs items={items} className="mb-6 -mt-2" />
}

export function OrcamentoSubNav({ orcamentoId }: Props) {
  const base = `/orcamentos/${orcamentoId}`
  const pathname = usePathname()

  // Na tela de listagem de planilhas (raiz do projeto), as abas ainda não
  // fazem sentido: elas só se aplicam depois que uma planilha é escolhida.
  if (pathname === base) return null

  const fallbackItems: TabItem[] = TABS.map(({ suffix, label, newGroup }) => ({
    key: suffix, label, href: `${base}/${suffix}`, active: false, newGroup,
  }))

  return (
    <Suspense fallback={<Tabs items={fallbackItems} className="mb-6 -mt-2" />}>
      <SubNavLinks orcamentoId={orcamentoId} />
    </Suspense>
  )
}
