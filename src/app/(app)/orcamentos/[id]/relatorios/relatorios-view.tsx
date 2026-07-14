'use client'

import { useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { CadernoData } from '@/lib/orcamento/caderno'
import { REPORT_CATALOG, findReport } from './report-catalog'
import { ReportList } from './report-list'
import { ReportDetailPanel } from './report-detail-panel'
import type { EscopoPlanilha, PlanilhaResumo } from './filters/planilha-selector'
import { PageHeader } from '@/components/ui/toolbar'

interface ServicoEstimadoManual {
  id?: string
  descricao: string
  valor: number
}

interface Props {
  orcamentoId: string
  data: CadernoData
  planilhas: PlanilhaResumo[]
  planilhaAtualId: string | null
  escopo: EscopoPlanilha
  planilhaIds: string[]
  servicosEstimadosManuais: ServicoEstimadoManual[]
}

const DEFAULT_REPORT_ID = 'planilha-sintetica'

export function RelatoriosView({ orcamentoId, data, planilhas, planilhaAtualId, escopo, planilhaIds, servicosEstimadosManuais }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [selectedId, setSelectedId] = useState(DEFAULT_REPORT_ID)
  const [search, setSearch] = useState('')

  const report = findReport(selectedId) ?? REPORT_CATALOG[0].reports[0]

  function handleEscopoChange(nextEscopo: EscopoPlanilha, selecionadas: string[]) {
    const params = new URLSearchParams(searchParams.toString())
    if (nextEscopo === 'todas') {
      params.delete('escopo')
      params.delete('planilhas')
    } else if (nextEscopo === 'atual') {
      params.set('escopo', 'atual')
      params.delete('planilhas')
    } else {
      params.set('escopo', 'selecionar')
      if (selecionadas.length > 0) params.set('planilhas', selecionadas.join(','))
      else params.delete('planilhas')
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}` as any)
    })
  }

  const fmt = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="space-y-5">
      <PageHeader
        title="Relatórios"
        description={<>{data.orcamento.nome_obra} — Total: <span className="font-medium text-gray-700">{fmt(data.totalGeral)}</span></>}
      />

      <div className="flex flex-col md:flex-row gap-6">
        <ReportList selectedId={report.id} onSelect={setSelectedId} search={search} onSearchChange={setSearch} />
        <ReportDetailPanel
          key={report.id}
          orcamentoId={orcamentoId}
          report={report}
          data={data}
          planilhas={planilhas}
          planilhaAtualId={planilhaAtualId}
          escopo={escopo}
          planilhaIds={planilhaIds}
          onEscopoChange={handleEscopoChange}
          pendingEscopo={isPending}
          servicosEstimadosManuais={servicosEstimadosManuais}
        />
      </div>
    </div>
  )
}
