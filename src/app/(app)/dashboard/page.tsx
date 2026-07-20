import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/toolbar'
import {
  getOrcamentosResumo,
  getPlanilhasResumo,
  getVersoesResumo,
  getEstruturaItens,
  getAtividadesRecentes,
  getBasesExternasResumo,
  getBasePropriaResumo,
  getResumoSistema,
  type PlanilhaResumo,
  type BaseResumo,
} from '@/lib/dashboard/queries'
import { derivarStatusProjeto } from '@/lib/dashboard/status-projeto'
import { agruparAtividades } from '@/lib/dashboard/agrupar-atividades'
import { computeCurvaAbcGeral, resumoPorClasse } from '@/lib/dashboard/curva-abc-geral'
import { gerarAlertas } from '@/lib/dashboard/alertas'
import { formatRelative } from '@/lib/dashboard/format-relative'

import { KpiRow } from './sections/kpi-row'
import { AcoesRapidas } from './sections/acoes-rapidas'
import { Alertas } from './sections/alertas'
import { ChartDistribuicao, type DistribuicaoItem } from './sections/chart-distribuicao'
import { ChartCurvaAbc } from './sections/chart-curva-abc'
import { ProjetosRecentes, type ProjetoRecenteItem } from './sections/projetos-recentes'
import { AtividadeRecente } from './sections/atividade-recente'
import { BasesDados } from './sections/bases-dados'
import { ResumoSistema } from './sections/resumo-sistema'

function SectionCard({ title, description, action, children }: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-gray-400">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const sb = supabase as any
  const { data: { user } } = await sb.auth.getUser()

  const [orcamentos, planilhas, versoes, estruturaItens, atividadesRaw, basesExternas, basePropria, resumoSistema] =
    await Promise.all([
      getOrcamentosResumo(sb),
      getPlanilhasResumo(sb),
      getVersoesResumo(sb),
      getEstruturaItens(sb),
      user ? getAtividadesRecentes(sb, user.id) : Promise.resolve([]),
      getBasesExternasResumo(sb),
      getBasePropriaResumo(sb),
      getResumoSistema(sb),
    ])

  // --- Derivações em memória, sem I/O extra ---

  const planilhasPorOrcamento = new Map<string, PlanilhaResumo[]>()
  for (const p of planilhas) {
    const arr = planilhasPorOrcamento.get(p.orcamento_id) ?? []
    arr.push(p)
    planilhasPorOrcamento.set(p.orcamento_id, arr)
  }
  const valorOrcamento = (orcamentoId: string) => {
    const ps = planilhasPorOrcamento.get(orcamentoId) ?? []
    return {
      comBdi: ps.reduce((s, p) => s + (p.total_com_bdi ?? 0), 0),
      semBdi: ps.reduce((s, p) => s + (p.total_custo ?? 0), 0),
    }
  }

  const valorComBdiTotal = planilhas.reduce((s, p) => s + (p.total_com_bdi ?? 0), 0)
  const valorSemBdiTotal = planilhas.reduce((s, p) => s + (p.total_custo ?? 0), 0)

  const bases: BaseResumo[] = [...basesExternas, ...(basePropria ? [basePropria] : [])]
  const qtdInsumosGlobais = resumoSistema?.total_insumos_globais ?? 0
  const qtdComposicoesGlobais = resumoSistema?.total_composicoes_globais ?? 0

  const ultimaAtualizacao = atividadesRaw[0]?.created_at ?? null

  const projetosRecentes: ProjetoRecenteItem[] = orcamentos.slice(0, 6).map((o) => {
    const { comBdi } = valorOrcamento(o.id)
    const status = derivarStatusProjeto(planilhasPorOrcamento.get(o.id) ?? [])
    return {
      id: o.id,
      nome: o.nome_obra,
      cliente: o.cliente,
      valor: comBdi,
      dataRelativa: formatRelative(o.ultimo_acesso ?? o.created_at),
      statusLabel: status.label,
      statusVariant: status.variant,
    }
  })

  const distribuicaoItems: DistribuicaoItem[] = orcamentos
    .map((o) => ({ id: o.id, nome: o.nome_obra, valor: valorOrcamento(o.id).comBdi }))
    .filter((i) => i.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 6)

  const curvaAbcGeral = computeCurvaAbcGeral(estruturaItens)
  const resumoClasses = resumoPorClasse(curvaAbcGeral) // não precisa dos nomes de orçamento, só das classes

  const atividadeAgrupada = agruparAtividades(atividadesRaw, 8)

  const alertas = gerarAlertas({ orcamentos, planilhas, versoes, bases, resumoSistema })

  const totalServicos = (resumoSistema?.total_servicos ?? 0) + (resumoSistema?.total_mao_de_obra ?? 0)

  const orcamentoMaisRecente = orcamentos[0]
  const relatoriosHref = orcamentoMaisRecente ? `/orcamentos/${orcamentoMaisRecente.id}/relatorios` : '/orcamentos'
  const baseSinapi = bases.find((b) => b.orgao === 'SINAPI')
  const importarBaseHref = baseSinapi ? `/bases/${baseSinapi.base_id}/importar` : '/bases'

  return (
    <div className="space-y-6">
      <PageHeader title="Início" description="Visão executiva dos seus orçamentos e da base de dados do sistema." />

      <KpiRow
        qtdOrcamentos={orcamentos.length}
        qtdPlanilhas={planilhas.length}
        valorComBdi={valorComBdiTotal}
        valorSemBdi={valorSemBdiTotal}
        qtdBases={bases.length}
        qtdInsumosGlobais={qtdInsumosGlobais}
        qtdComposicoesGlobais={qtdComposicoesGlobais}
        ultimaAtualizacao={ultimaAtualizacao}
      />

      <AcoesRapidas relatoriosHref={relatoriosHref} importarBaseHref={importarBaseHref} />

      <SectionCard title="Alertas">
        <Alertas items={alertas} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Distribuição do valor dos orçamentos" description="Maiores orçamentos por valor com BDI">
          <ChartDistribuicao items={distribuicaoItems} />
        </SectionCard>
        <SectionCard
          title="Curva ABC Geral"
          description="Itens de planilha de todos os seus orçamentos, por impacto financeiro"
          action={
            <Link href="/curva-abc" className="text-xs font-medium text-primary-700 hover:underline">
              Ver completa →
            </Link>
          }
        >
          <ChartCurvaAbc resumo={resumoClasses} />
        </SectionCard>
      </div>

      <SectionCard title="Projetos Recentes" action={<Link href="/orcamentos" className="text-xs font-medium text-primary-700 hover:underline">Ver todos →</Link>}>
        <ProjetosRecentes items={projetosRecentes} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard title="Atividade Recente" action={<Link href="/logs" className="text-xs font-medium text-primary-700 hover:underline">Ver tudo →</Link>}>
          <AtividadeRecente items={atividadeAgrupada} />
        </SectionCard>
        <SectionCard title="Bases de Dados">
          <BasesDados bases={bases} />
        </SectionCard>
      </div>

      <SectionCard title="Resumo do Sistema" description="Totais da biblioteca global e dos seus orçamentos">
        <ResumoSistema
          totalInsumosGlobais={qtdInsumosGlobais}
          totalComposicoesGlobais={qtdComposicoesGlobais}
          totalItensOrcados={estruturaItens.length}
          totalServicos={totalServicos}
          totalEquipamentos={resumoSistema?.total_equipamentos ?? 0}
          totalMateriais={resumoSistema?.total_materiais ?? 0}
        />
      </SectionCard>
    </div>
  )
}
