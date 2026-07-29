import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/toolbar'
import { getOrcamentosResumo, getEstruturaItens } from '@/lib/dashboard/queries'
import { computeCurvaAbcGeral } from '@/lib/dashboard/curva-abc-geral'
import { CurvaAbcGeralView } from './curva-abc-geral-view'

export default async function CurvaAbcGeralPage() {
  const supabase = await createClient()
  const sb = supabase as any

  const [orcamentos, estruturaItens] = await Promise.all([
    getOrcamentosResumo(sb),
    getEstruturaItens(sb),
  ])

  // orcamentos já exclui modelos (getOrcamentosResumo filtra is_modelo=false)
  // — estruturaItens ainda não, então precisa ser filtrado aqui pra não
  // vazar itens de modelo na Curva ABC Geral.
  const orcamentoIdsValidos = new Set(orcamentos.map(o => o.id))
  const estruturaItensValidos = estruturaItens.filter(i => orcamentoIdsValidos.has(i.orcamento_id))

  const nomesPorOrcamento = new Map(orcamentos.map(o => [o.id, o.nome_obra]))
  const items = computeCurvaAbcGeral(estruturaItensValidos, nomesPorOrcamento)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Curva ABC Geral"
        description="Itens de planilha de todos os seus orçamentos, por impacto financeiro — sem decompor sub-composições (para o detalhamento por insumo, abra a Curva ABC de um projeto específico)."
      />
      <CurvaAbcGeralView items={items} />
    </div>
  )
}
