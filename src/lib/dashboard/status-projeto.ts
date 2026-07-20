import type { PlanilhaResumo } from './queries'

export type StatusProjeto = 'sem_bdi' | 'desatualizado' | 'rascunho' | 'atualizado'

export interface StatusProjetoInfo {
  status: StatusProjeto
  label: string
  variant: 'warning' | 'error' | 'neutral' | 'success'
}

const STATUS_INFO: Record<StatusProjeto, Omit<StatusProjetoInfo, 'status'>> = {
  sem_bdi: { label: 'Sem BDI', variant: 'warning' },
  desatualizado: { label: 'Cálculo desatualizado', variant: 'error' },
  rascunho: { label: 'Rascunho', variant: 'neutral' },
  atualizado: { label: 'Atualizado', variant: 'success' },
}

type PlanilhaStatusInput = Pick<PlanilhaResumo, 'bdi_global' | 'invalidado_em' | 'ultima_calculo_em' | 'total_com_bdi'>

/**
 * Deriva o status de um orçamento a partir das planilhas que ele já tem —
 * sem coluna nova no banco. Não existe `tabela_orcamentos.status`; um
 * orçamento pode ter múltiplas planilhas, então usamos o "pior caso" entre
 * elas (precedência abaixo, do mais para o menos crítico).
 */
export function derivarStatusProjeto(planilhas: PlanilhaStatusInput[]): StatusProjetoInfo {
  if (planilhas.length === 0) {
    return { status: 'rascunho', ...STATUS_INFO.rascunho }
  }
  if (planilhas.some(p => !p.bdi_global)) {
    return { status: 'sem_bdi', ...STATUS_INFO.sem_bdi }
  }
  if (planilhas.some(p => p.invalidado_em && (!p.ultima_calculo_em || p.invalidado_em > p.ultima_calculo_em))) {
    return { status: 'desatualizado', ...STATUS_INFO.desatualizado }
  }
  if (planilhas.every(p => !p.total_com_bdi)) {
    return { status: 'rascunho', ...STATUS_INFO.rascunho }
  }
  return { status: 'atualizado', ...STATUS_INFO.atualizado }
}
