import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OrcamentoBreadcrumb } from '@/components/orcamento-breadcrumb'
import { OrcamentoSubNav } from '@/components/orcamento-subnav'
import { SyncActiveProject } from '@/components/sync-active-project'

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
    .select('id, nome_obra, codigo, cliente')
    .eq('id', id)
    .single()

  if (!orcamento) notFound()

  await sb
    .from('tabela_orcamentos')
    .update({ ultimo_acesso: new Date().toISOString() })
    .eq('id', id)

  return (
    <div className="space-y-0">
      <SyncActiveProject
        project={{ id, nome_obra: orcamento.nome_obra, codigo: orcamento.codigo ?? null, cliente: orcamento.cliente ?? null }}
      />
      <OrcamentoBreadcrumb
        orcamentoId={id}
        orcamentoNome={orcamento.nome_obra}
      />
      <OrcamentoSubNav orcamentoId={id} />
      {children}
    </div>
  )
}
