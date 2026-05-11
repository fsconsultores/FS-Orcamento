import { createClient } from '@/lib/supabase/server'
import { PlanilhaView } from './planilha-view'
import { ImportPlanilhaForm } from './import-planilha-form'
import type { EstruturaItem } from './planilha-action'

export default async function PlanilhaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const sb = supabase as any

  const [{ data }, { data: orc }] = await Promise.all([
    sb.from('orcamento_estrutura')
      .select('id, parent_id, numero, nivel, codigo, descricao, unidade, quantidade, custo_unitario, tipo, ordem')
      .eq('orcamento_id', orcamentoId)
      .order('nivel', { ascending: true })
      .order('ordem', { ascending: true }),
    sb.from('tabela_orcamentos')
      .select('nome_obra, codigo')
      .eq('id', orcamentoId)
      .single(),
  ])

  const items: EstruturaItem[] = data ?? []
  const nomeOrcamento: string = orc ? `${orc.codigo} - ${orc.nome_obra}` : orcamentoId

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planilha Orçamentária</h1>
          <p className="text-sm text-gray-500 mt-1">
            {items.length === 0
              ? 'Nenhum item. Importe um CSV ou adicione manualmente.'
              : `${items.filter(i => i.tipo === 'item').length} item(ns) em ${items.filter(i => i.tipo === 'grupo').length} grupo(s)`}
          </p>
        </div>
        <ImportPlanilhaForm orcamentoId={orcamentoId} />
      </div>

      <PlanilhaView initialItems={items} orcamentoId={orcamentoId} nomeOrcamento={nomeOrcamento} />
    </div>
  )
}
