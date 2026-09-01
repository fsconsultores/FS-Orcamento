import { notFound } from 'next/navigation'
import { after } from 'next/server'
import Link from 'next/link'
import { GitBranch } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { OrcamentoBreadcrumb } from '@/components/orcamento-breadcrumb'
import { OrcamentoSubNav } from '@/components/orcamento-subnav'
import { SyncActiveProject } from '@/components/sync-active-project'
import { Badge } from '@/components/ui/badge'
import { PlanilhaSwitcher } from './planilha/planilha-switcher'
import { GlobalCreateActions } from './global-create-actions'
import { getPlanilhasEnsuredCached } from '@/lib/orcamento/planilhas-server'
import { getOrcamentoHeaderCached } from '@/lib/orcamento/orcamento-header'

export default async function OrcamentoLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const orcamento = await getOrcamentoHeaderCached(id)
  if (!orcamento) notFound()

  // Não bloqueia a navegação por essa escrita: roda depois da resposta ser
  // enviada (garantido mesmo em ambiente serverless), em vez de segurar toda
  // troca de aba esperando um UPDATE que não afeta o que é renderizado.
  after(async () => {
    try {
      const supabase = (await createClient()) as any
      await supabase.from('tabela_orcamentos').update({ ultimo_acesso: new Date().toISOString() }).eq('id', id)
    } catch {}
  })

  // Planilhas do orçamento — buscadas aqui (não em cada página) para que o
  // seletor de planilha apareça em todas as abas, não só na Planilha.
  let planilhas: { id: string; nome: string; bdi_global: number }[] = []
  try {
    planilhas = await getPlanilhasEnsuredCached(id)
  } catch {}

  return (
    <div className="space-y-0">
      <SyncActiveProject
        project={{ id, nome_obra: orcamento.nome_obra, codigo: orcamento.codigo ?? null, cliente: orcamento.cliente ?? null }}
      />
      <OrcamentoBreadcrumb
        orcamentoId={id}
        orcamentoNome={orcamento.nome_obra}
        badge={
          <Link href={`/orcamentos/${id}/versoes`} title="Ver todas as revisões desta família">
            <Badge variant="brand" className="ml-1.5 hover:bg-primary-100">
              <GitBranch size={11} />
              Revisão {orcamento.numeroRevisao} de {orcamento.totalRevisoes}
            </Badge>
          </Link>
        }
        actions={
          <div className="flex items-center gap-2">
            {planilhas.length > 0 && (
              <PlanilhaSwitcher
                orcamentoId={id}
                planilhas={planilhas}
                bdiGlobalOrcamento={orcamento.bdi_global ?? 0}
              />
            )}
            <GlobalCreateActions orcamentoId={id} />
          </div>
        }
      />
      <OrcamentoSubNav orcamentoId={id} />
      {children}
    </div>
  )
}
