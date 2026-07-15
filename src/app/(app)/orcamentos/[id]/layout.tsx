import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OrcamentoBreadcrumb } from '@/components/orcamento-breadcrumb'
import { OrcamentoSubNav } from '@/components/orcamento-subnav'
import { SyncActiveProject } from '@/components/sync-active-project'
import { PlanilhaSwitcher } from './planilha/planilha-switcher'
import { GlobalCreateActions } from './global-create-actions'
import { getOrCreateDefaultPlanilha, getPlanilhasByOrcamento } from '@/lib/orcamento/planilhas'

export default async function OrcamentoLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const sb = supabase as any

  const { data: orcamento } = await sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, codigo, cliente, bdi_global')
    .eq('id', id)
    .single()

  if (!orcamento) notFound()

  await sb
    .from('tabela_orcamentos')
    .update({ ultimo_acesso: new Date().toISOString() })
    .eq('id', id)

  // Planilhas do orçamento — buscadas aqui (não em cada página) para que o
  // seletor de planilha apareça em todas as abas, não só na Planilha.
  let planilhas: { id: string; nome: string; bdi_global: number }[] = []
  try {
    await getOrCreateDefaultPlanilha(sb, id)
    planilhas = await getPlanilhasByOrcamento(sb, id)
  } catch {}

  return (
    <div className="space-y-0">
      <SyncActiveProject
        project={{ id, nome_obra: orcamento.nome_obra, codigo: orcamento.codigo ?? null, cliente: orcamento.cliente ?? null }}
      />
      <OrcamentoBreadcrumb
        orcamentoId={id}
        orcamentoNome={orcamento.nome_obra}
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
