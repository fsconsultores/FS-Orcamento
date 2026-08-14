import { createClient } from '@/lib/supabase/server'
import { getComposicoesBasico } from '@/lib/orcamento'
import { ComposicoesTable } from './composicoes-table'
import { DevProfiler } from '@/components/dev-profiler'

export default async function OrcamentoComposicoesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const sb = supabase as any

  // Busca só as composições (rápida mesmo em orçamentos com milhares de
  // linhas) — custo_unitario, "usados/não usados" e os dados de export
  // dependem do grafo completo (composições podem referenciar outras em
  // cadeia) e são carregados à parte, em background, sem bloquear esta
  // renderização. Ver getComposicoesDetalhadoAction.
  const composicoes = await getComposicoesBasico(sb, orcamentoId)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Composições do Orçamento</h1>
        <p className="text-sm text-gray-500 mt-1">{composicoes.length} composição(ões)</p>
      </div>

      {/* Exportar/Limpar ficam na barra de ferramentas da tabela, mesmo
          padrão da aba Insumos — facilita achar as mesmas ações no mesmo
          lugar ao trocar de aba. */}
      <DevProfiler id="ComposicoesTable">
        <ComposicoesTable composicoes={composicoes} orcamentoId={orcamentoId} />
      </DevProfiler>
    </div>
  )
}
