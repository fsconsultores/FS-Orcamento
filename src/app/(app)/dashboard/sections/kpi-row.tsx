import { Building2, Wallet, Database, Clock } from 'lucide-react'
import { StatRow, StatCard } from '@/components/ui/stat-row'
import { fmt } from '@/lib/curva-abc'
import { formatRelative } from '@/lib/dashboard/format-relative'

export function KpiRow({
  qtdOrcamentos,
  qtdPlanilhas,
  valorComBdi,
  valorSemBdi,
  qtdBases,
  qtdInsumosGlobais,
  qtdComposicoesGlobais,
  ultimaAtualizacao,
}: {
  qtdOrcamentos: number
  qtdPlanilhas: number
  valorComBdi: number
  valorSemBdi: number
  qtdBases: number
  qtdInsumosGlobais: number
  qtdComposicoesGlobais: number
  ultimaAtualizacao: string | null
}) {
  return (
    <StatRow>
      <StatCard
        size="lg"
        href="/orcamentos"
        icon={<Building2 size={16} />}
        label="Projetos ativos"
        value={qtdOrcamentos.toLocaleString('pt-BR')}
        hint={`${qtdPlanilhas.toLocaleString('pt-BR')} planilha${qtdPlanilhas === 1 ? '' : 's'}`}
      />
      <StatCard
        size="lg"
        icon={<Wallet size={16} />}
        label="Valor total orçado"
        value={fmt(valorComBdi)}
        hint={`${fmt(valorSemBdi)} sem BDI`}
      />
      <StatCard
        size="lg"
        href="/bases"
        icon={<Database size={16} />}
        label="Bases cadastradas"
        value={qtdBases.toLocaleString('pt-BR')}
        hint={`${qtdInsumosGlobais.toLocaleString('pt-BR')} insumos · ${qtdComposicoesGlobais.toLocaleString('pt-BR')} composições`}
      />
      <StatCard
        size="lg"
        icon={<Clock size={16} />}
        label="Última atualização"
        value={ultimaAtualizacao ? formatRelative(ultimaAtualizacao) : '—'}
        hint={ultimaAtualizacao ? new Date(ultimaAtualizacao).toLocaleString('pt-BR') : 'Nenhuma alteração registrada'}
      />
    </StatRow>
  )
}
