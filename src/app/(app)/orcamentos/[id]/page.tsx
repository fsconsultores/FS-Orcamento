import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PlanilhasPicker } from './planilhas-picker'

export default async function OrcamentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const sb = (await createClient()) as any

  const { data: orc } = await sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, codigo, cliente, data')
    .eq('id', id)
    .single()

  if (!orc) notFound()

  let planilhas: { id: string; nome: string; bdi_global: number; ordem: number }[] = []
  try {
    const { data } = await sb
      .from('orcamento_planilhas')
      .select('id, nome, bdi_global, ordem')
      .eq('orcamento_id', id)
      .order('ordem', { ascending: true })
    planilhas = data ?? []
  } catch {}

  return (
    <PlanilhasPicker
      orcamentoId={id}
      nomeObra={orc.nome_obra}
      planilhas={planilhas}
    />
  )
}
