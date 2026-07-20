import type { OrcamentoResumo, PlanilhaResumo, VersaoResumo, BaseResumo, ResumoSistema } from './queries'

export interface Alerta {
  key: string
  titulo: string
  descricao: string
  variant: 'warning' | 'error'
  href: string
}

const BASE_DESATUALIZADA_DIAS = 180

/**
 * Alertas inteligentes — função pura, SEM I/O próprio: reaproveita os dados
 * que as outras seções da dashboard já buscaram (orçamentos, planilhas,
 * versões, bases, resumo do sistema). Nenhum alerta dispara uma query nova.
 */
export function gerarAlertas(input: {
  orcamentos: OrcamentoResumo[]
  planilhas: PlanilhaResumo[]
  versoes: VersaoResumo[]
  bases: BaseResumo[]
  resumoSistema: ResumoSistema | null
}): Alerta[] {
  const { orcamentos, planilhas, versoes, bases, resumoSistema } = input
  const alertas: Alerta[] = []

  const planilhasPorOrcamento = new Map<string, PlanilhaResumo[]>()
  for (const p of planilhas) {
    const arr = planilhasPorOrcamento.get(p.orcamento_id) ?? []
    arr.push(p)
    planilhasPorOrcamento.set(p.orcamento_id, arr)
  }

  const orcamentosSemBdi = orcamentos.filter(o =>
    (planilhasPorOrcamento.get(o.id) ?? []).some(p => !p.bdi_global)
  )
  if (orcamentosSemBdi.length > 0) {
    alertas.push({
      key: 'sem-bdi',
      titulo: `${orcamentosSemBdi.length} ${orcamentosSemBdi.length === 1 ? 'projeto sem BDI' : 'projetos sem BDI'}`,
      descricao: orcamentosSemBdi.length === 1
        ? orcamentosSemBdi[0].nome_obra
        : 'Revise a configuração de BDI desses orçamentos.',
      variant: 'warning',
      href: orcamentosSemBdi.length === 1 ? `/orcamentos/${orcamentosSemBdi[0].id}/configuracoes` : '/orcamentos',
    })
  }

  const orcamentosDesatualizados = orcamentos.filter(o =>
    (planilhasPorOrcamento.get(o.id) ?? []).some(p => p.invalidado_em && (!p.ultima_calculo_em || p.invalidado_em > p.ultima_calculo_em))
  )
  if (orcamentosDesatualizados.length > 0) {
    alertas.push({
      key: 'calculo-desatualizado',
      titulo: `${orcamentosDesatualizados.length} ${orcamentosDesatualizados.length === 1 ? 'projeto com cálculo desatualizado' : 'projetos com cálculo desatualizado'}`,
      descricao: 'Recalcule a planilha para refletir as últimas alterações.',
      variant: 'error',
      href: orcamentosDesatualizados.length === 1 ? `/orcamentos/${orcamentosDesatualizados[0].id}/planilha` : '/orcamentos',
    })
  }

  const idsComVersao = new Set(versoes.map(v => v.orcamento_id))
  const orcamentosSemVersao = orcamentos.filter(o => !idsComVersao.has(o.id))
  if (orcamentosSemVersao.length > 0) {
    alertas.push({
      key: 'sem-versao',
      titulo: `${orcamentosSemVersao.length} ${orcamentosSemVersao.length === 1 ? 'orçamento sem versão salva' : 'orçamentos sem versão salva'}`,
      descricao: 'Salve uma versão para poder restaurar este ponto depois.',
      variant: 'warning',
      href: orcamentosSemVersao.length === 1 ? `/orcamentos/${orcamentosSemVersao[0].id}/versoes` : '/orcamentos',
    })
  }

  const agora = Date.now()
  const basesDesatualizadas = bases.filter(b => {
    if (b.tipo_base !== 'externa') return false
    if (b.total_insumos === 0 && b.total_composicoes === 0) return false
    if (!b.ultima_importacao) return true
    const dias = (agora - new Date(b.ultima_importacao).getTime()) / 86_400_000
    return dias > BASE_DESATUALIZADA_DIAS
  })
  if (basesDesatualizadas.length > 0) {
    alertas.push({
      key: 'bases-desatualizadas',
      titulo: `${basesDesatualizadas.length} ${basesDesatualizadas.length === 1 ? 'base desatualizada' : 'bases desatualizadas'}`,
      descricao: `Sem importação há mais de ${Math.round(BASE_DESATUALIZADA_DIAS / 30)} meses.`,
      variant: 'warning',
      href: '/bases',
    })
  }

  if (resumoSistema && resumoSistema.total_insumos_sem_preco > 0) {
    alertas.push({
      key: 'insumos-sem-preco',
      titulo: `${resumoSistema.total_insumos_sem_preco.toLocaleString('pt-BR')} insumos sem preço`,
      descricao: 'Itens da biblioteca global com preço zerado.',
      variant: 'warning',
      href: '/insumos',
    })
  }

  if (resumoSistema && resumoSistema.total_composicoes_incompletas > 0) {
    alertas.push({
      key: 'composicoes-incompletas',
      titulo: `${resumoSistema.total_composicoes_incompletas.toLocaleString('pt-BR')} composições incompletas`,
      descricao: 'Composições da biblioteca global sem nenhum insumo vinculado.',
      variant: 'warning',
      href: '/composicoes',
    })
  }

  return alertas
}
