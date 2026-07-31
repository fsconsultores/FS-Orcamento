import Link from 'next/link'
import { FileBarChart, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { findReport } from './report-catalog'
import { PageHeader } from '@/components/ui/toolbar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Timeline, TimelineItem } from '@/components/ui/timeline'

type HistoricoRow = {
  id: string
  usuario_email: string | null
  mensagem: string
  detalhes: { reportId?: string; formato?: string; escopo?: string; planilhaIds?: string[] } | null
  created_at: string
}

function escopoLabel(detalhes: HistoricoRow['detalhes']): string {
  if (!detalhes?.escopo) return ''
  if (detalhes.escopo === 'todas') return 'Todas as planilhas'
  if (detalhes.escopo === 'atual') return 'Planilha ativa'
  const n = detalhes.planilhaIds?.length ?? 0
  return `${n} ${n === 1 ? 'planilha selecionada' : 'planilhas selecionadas'}`
}

export default async function RelatoriosHistoricoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ planilha?: string }>
}) {
  const { id: orcamentoId } = await params
  const { planilha: planilhaId } = await searchParams
  // Repassa a planilha ativa (chegou aqui via aba/subnav, que já propaga
  // ?planilha=) pros links de "Gerar relatório" — sem isso, /relatorios/gerar
  // não sabe qual é "a planilha atual" e desabilita essa opção no seletor de
  // escopo, sobrando só "Selecionar planilhas" manualmente.
  const qs = planilhaId ? `?planilha=${planilhaId}` : ''
  const qsReport = (reportId: string) => planilhaId ? `?report=${reportId}&planilha=${planilhaId}` : `?report=${reportId}`
  const sb = (await createClient()) as any

  const { data: historico } = await sb
    .from('historico_alteracoes')
    .select('id, usuario_email, mensagem, detalhes, created_at')
    .eq('orcamento_id', orcamentoId)
    .eq('entidade', 'relatorio')
    .eq('acao', 'gerar_relatorio')
    .order('created_at', { ascending: false })
    .limit(30)

  const registros = (historico ?? []) as HistoricoRow[]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Relatórios"
        description="Últimos relatórios gerados neste orçamento."
        actions={
          <Link href={`/orcamentos/${orcamentoId}/relatorios/gerar${qs}` as any}>
            <Button icon={<FileBarChart size={15} />}>Gerar relatório</Button>
          </Link>
        }
      />

      {registros.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <EmptyState
            icon={<FileText size={20} />}
            title="Nenhum relatório gerado ainda"
            description="Gere um relatório (planilha, curva ABC ou caderno completo) e ele aparece aqui."
            action={
              <Link href={`/orcamentos/${orcamentoId}/relatorios/gerar${qs}` as any}>
                <Button icon={<FileBarChart size={15} />}>Gerar relatório</Button>
              </Link>
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <Timeline>
            {registros.map((r, i) => {
              const report = r.detalhes?.reportId ? findReport(r.detalhes.reportId) : undefined
              return (
                <TimelineItem
                  key={r.id}
                  icon={report?.icon ?? <FileText size={14} />}
                  tone="primary"
                  isLast={i === registros.length - 1}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-xs text-gray-400 font-mono tabular-nums">
                      {new Date(r.created_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {r.detalhes?.formato && (
                      <Badge variant="neutral">{r.detalhes.formato.toUpperCase()}</Badge>
                    )}
                    <span className="text-xs text-gray-400">{r.usuario_email ?? '—'}</span>
                    {escopoLabel(r.detalhes) && (
                      <span className="text-xs text-gray-400">· {escopoLabel(r.detalhes)}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-gray-800">{r.mensagem}</p>
                  {report && (
                    <Link
                      href={`/orcamentos/${orcamentoId}/relatorios/gerar${qsReport(report.id)}` as any}
                      className="mt-1 inline-block text-xs font-medium text-primary-700 hover:underline"
                    >
                      Gerar novamente
                    </Link>
                  )}
                </TimelineItem>
              )
            })}
          </Timeline>
        </div>
      )}
    </div>
  )
}
