import { createClient } from '@/lib/supabase/server'
import { ConfiguracoesView } from './configuracoes-view'
import { PageHeader } from '@/components/ui/toolbar'
import { getPavimentosByOrcamento } from '@/lib/orcamento/pavimentos'

export default async function ConfiguracoesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const sb = supabase as any

  const [{ data: orc }, { data: extra }, { data: servicos }, { data: grupos }, pavimentos] = await Promise.all([
    sb.from('tabela_orcamentos')
      .select('nome_obra, codigo, cliente, data, bdi_global, area_total, area_coberta, area_equivalente')
      .eq('id', orcamentoId)
      .single(),
    sb.from('tabela_orcamentos')
      .select('local, numeracao_digitos, categorias_grafico')
      .eq('id', orcamentoId)
      .single(),
    sb.from('orcamento_servicos_estimados')
      .select('id, descricao, valor')
      .eq('orcamento_id', orcamentoId)
      .order('ordem', { ascending: true }),
    sb.from('orcamento_estrutura')
      .select('numero, descricao, estimado')
      .eq('orcamento_id', orcamentoId)
      .eq('tipo', 'grupo')
      .is('parent_id', null)
      .order('ordem', { ascending: true }),
    getPavimentosByOrcamento(supabase, orcamentoId),
  ])

  const gruposNivel1 = (grupos ?? []).filter((g: any) => !g.estimado)

  return (
    <div className="space-y-5">
      <PageHeader title="Configurações" description="Personalize os dados e o comportamento deste orçamento." />

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
        pavimentos={pavimentos}
        gruposNivel1={gruposNivel1.map((g: any) => ({ numero: g.numero, descricao: g.descricao }))}
        categoriasGrafico={extra?.categorias_grafico ?? {}}
      />
    </div>
  )
}
