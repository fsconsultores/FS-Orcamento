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

  const nomesPorOrcamento = new Map(orcamentos.map(o => [o.id, o.nome_obra]))
  const items = computeCurvaAbcGeral(estruturaItens, nomesPorOrcamento)

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
