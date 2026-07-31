'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import type { CadernoData } from '@/lib/orcamento/caderno'
import { REPORT_CATALOG, findReport } from './report-catalog'
import { ReportList } from './report-list'
import { ReportDetailPanel } from './report-detail-panel'
import type { EscopoPlanilha, PlanilhaResumo } from './filters/planilha-selector'
import { PageHeader } from '@/components/ui/toolbar'
import { StatRow, StatCard } from '@/components/ui/stat-row'

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

  // ?report= vem do link "Gerar novamente" na tela de histórico
  // (/orcamentos/[id]/relatorios) — pré-seleciona em vez de sempre abrir a
  // Planilha Sintética.
  const reportParam = searchParams.get('report')
  const [selectedId, setSelectedId] = useState(
    reportParam && findReport(reportParam) ? reportParam : DEFAULT_REPORT_ID
  )
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

  // "Resumo da revisão" — reutiliza data.itensEstimados (já calculado em
  // getCadernoData, sem consulta extra) para dar uma visão rápida antes de
  // emitir a proposta. Reflete o mesmo escopo (planilha atual/selecionadas)
  // já aplicado ao restante da tela.
  const resumoEstimados = useMemo(() => {
    const qtd = data.itensEstimados.reduce((s, g) => s + g.itens.length, 0)
    const valor = data.itensEstimados.reduce((s, g) => s + g.total, 0)
    const percentual = data.totalGeralComBdi > 0 ? (valor / data.totalGeralComBdi) * 100 : 0
    return { qtd, valor, percentual, planilhas: data.itensEstimados.length }
  }, [data.itensEstimados, data.totalGeralComBdi])

  return (
    <div className="space-y-5">
      <Link href={`/orcamentos/${orcamentoId}/relatorios`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={14} /> Voltar para últimos relatórios
      </Link>
      <PageHeader
        title="Gerar relatório"
        description={<>{data.orcamento.nome_obra} — Total: <span className="font-medium text-gray-700">{fmt(data.totalGeral)}</span></>}
      />

      {resumoEstimados.qtd > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <AlertTriangle size={13} /> Resumo da revisão — Serviços com Preços Estimados
          </p>
          <StatRow>
            <StatCard label="Serviços com preço estimado" value={resumoEstimados.qtd} />
            <StatCard label="Valor total estimado" value={fmt(resumoEstimados.valor)} />
            <StatCard label="% do orçamento" value={`${resumoEstimados.percentual.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} />
            <StatCard label="Planilhas afetadas" value={resumoEstimados.planilhas} />
          </StatRow>
        </div>
      )}

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
