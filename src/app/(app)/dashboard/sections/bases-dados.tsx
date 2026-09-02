import Link from 'next/link'
import { Database } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { baseLabelFromOrgao } from '@/components/base-labels'
import { formatRelative } from '@/lib/dashboard/format-relative'
import type { BaseResumo } from '@/lib/dashboard/queries'

const ORDEM_ORGAO = ['SINAPI', 'DNIT', 'DER', 'SUDECAP']

export function BasesDados({ bases }: { bases: BaseResumo[] }) {
  const ordenadas = [...bases].sort((a, b) => {
    const rankA = a.tipo_base === 'propria' ? ORDEM_ORGAO.length : ORDEM_ORGAO.indexOf(a.orgao)
    const rankB = b.tipo_base === 'propria' ? ORDEM_ORGAO.length : ORDEM_ORGAO.indexOf(b.orgao)
    return (rankA === -1 ? 99 : rankA) - (rankB === -1 ? 99 : rankB)
  })

  if (ordenadas.length === 0) {
    return <EmptyState icon={<Database size={18} />} title="Nenhuma base cadastrada ainda." />
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-gray-100">
        {ordenadas.map((b) => {
          // Base cadastrada mas nunca importada (0 insumos, 0 composições) é
          // diferente de uma base saudável — sem destaque, as duas ficavam
          // com o mesmo peso visual (texto cinza igual) e essa passava
          // despercebida, mesmo sendo a única que precisa de ação.
          const vazia = b.total_insumos === 0 && b.total_composicoes === 0 && !b.ultima_importacao
          return (
            // Empilha em telas estreitas — nome + 3 estatísticas (insumos,
            // composições, data) lado a lado não cabem numa tela de celular
            // sem estourar a largura (bloco de estatísticas é shrink-0 de
            // propósito, pra não espremer os números; então quem cede espaço
            // é o layout, não o conteúdo).
            <li key={b.base_id} className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className={`flex min-w-0 items-center gap-1.5 truncate font-medium ${vazia ? 'text-amber-700' : 'text-gray-700'}`}>
                {vazia && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Nunca importada" />}
                {b.tipo_base === 'propria' ? 'Base Própria' : baseLabelFromOrgao(b.orgao)}
              </span>
              <span className="flex shrink-0 items-center gap-3 text-xs tabular-nums text-gray-500">
                <span>{b.total_insumos.toLocaleString('pt-BR')} insumos</span>
                <span>{b.total_composicoes.toLocaleString('pt-BR')} composições</span>
                <span className={vazia ? 'font-medium text-amber-600' : 'text-gray-400'}>
                  {b.ultima_importacao ? formatRelative(b.ultima_importacao) : 'nunca importado'}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      <Link
        href="/bases"
        className="inline-flex h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        Gerenciar Bases
      </Link>
    </div>
  )
}
