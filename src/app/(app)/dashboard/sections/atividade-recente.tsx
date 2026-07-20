import { Activity, CircleDollarSign, UploadCloud, GitCommitHorizontal, RotateCcw, Copy, PlusCircle } from 'lucide-react'
import { Timeline, TimelineItem, type TimelineTone } from '@/components/ui/timeline'
import { EmptyState } from '@/components/ui/empty-state'
import { formatRelative } from '@/lib/dashboard/format-relative'
import { formatAtividadeLabel, type AtividadeAgrupada } from '@/lib/dashboard/agrupar-atividades'

const ICONE_POR_ACAO: Record<string, typeof Activity> = {
  atualizar_preco_insumo: CircleDollarSign,
  importar_sinapi: UploadCloud,
  importar_da_base: UploadCloud,
  importar_insumos: UploadCloud,
  importar_composicoes: UploadCloud,
  importar_planilha: UploadCloud,
  versao_criada: GitCommitHorizontal,
  versao_restaurada: RotateCcw,
  duplicar_orcamento: Copy,
  criar_orcamento: PlusCircle,
}

const TOM_POR_ACAO: Record<string, TimelineTone> = {
  atualizar_preco_insumo: 'success',
  importar_sinapi: 'primary',
  importar_da_base: 'primary',
  importar_insumos: 'primary',
  importar_composicoes: 'primary',
  importar_planilha: 'primary',
  versao_criada: 'primary',
  versao_restaurada: 'warning',
  duplicar_orcamento: 'neutral',
  criar_orcamento: 'success',
}

export function AtividadeRecente({ items }: { items: AtividadeAgrupada[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Activity size={18} />}
        title="Nenhuma atividade recente"
        description="Alterações de preço, importações e versões salvas aparecem aqui."
      />
    )
  }

  return (
    <Timeline>
      {items.map((a, idx) => {
        const Icon = ICONE_POR_ACAO[a.acao] ?? Activity
        const tom = TOM_POR_ACAO[a.acao] ?? 'neutral'
        return (
          <TimelineItem key={a.key} icon={<Icon size={14} />} tone={tom} isLast={idx === items.length - 1}>
            <p className="text-sm text-gray-700">{formatAtividadeLabel(a)}</p>
            <p className="mt-0.5 text-xs text-gray-400" title={new Date(a.created_at).toLocaleString('pt-BR')}>
              {formatRelative(a.created_at)}
            </p>
          </TimelineItem>
        )
      })}
    </Timeline>
  )
}
