import { createClient } from '@/lib/supabase/server'
import { ConfiguracoesView } from './configuracoes-view'

export default async function ConfiguracoesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const sb = supabase as any

  const [{ data: orc }, { data: extra }, { data: servicos }] = await Promise.all([
    sb.from('tabela_orcamentos')
      .select('nome_obra, codigo, cliente, data, bdi_global, area_total, area_coberta, area_equivalente')
      .eq('id', orcamentoId)
      .single(),
    sb.from('tabela_orcamentos')
      .select('local, numeracao_digitos')
      .eq('id', orcamentoId)
      .single(),
    sb.from('orcamento_servicos_estimados')
      .select('id, descricao, valor')
      .eq('orcamento_id', orcamentoId)
      .order('ordem', { ascending: true }),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-sm text-gray-500 mt-1">Personalize os dados e o comportamento deste orçamento.</p>
      </div>

      <ConfiguracoesView
        orcamentoId={orcamentoId}
        nomeObra={orc?.nome_obra ?? ''}
        codigo={orc?.codigo ?? ''}
        cliente={orc?.cliente ?? ''}
        local={extra?.local ?? ''}
        dataOrcamento={orc?.data ?? ''}
        bdiGlobal={orc?.bdi_global ?? 0}
        areaTotal={orc?.area_total ?? null}
        areaCoberta={orc?.area_coberta ?? null}
        areaEquivalente={orc?.area_equivalente ?? null}
        numeracaoDigitos={extra?.numeracao_digitos ?? [1, 1, 1, 1]}
        servicosEstimados={(servicos ?? []).map((s: any) => ({ id: s.id, descricao: s.descricao, valor: s.valor }))}
      />
    </div>
  )
}
