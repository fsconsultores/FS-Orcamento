// Tipos para insumos e composições vinculados a um orçamento específico.
// Isolados por orcamento_id — nunca compartilhados entre orçamentos.

export interface OrcamentoPlanilha {
  id: string
  orcamento_id: string
  nome: string
  bdi_global: number
  ordem: number
  created_at: string
}

export interface OrcamentoInsumo {
  id: string
  orcamento_id: string
  composicao_id: string | null
  codigo: string
  descricao: string
  unidade: string
  custo: number
  indice: number
  grupo: string | null
  base: string | null
  data_ref: string | null
  custo_atualizado_em?: string | null
  codigo_original?: string | null
  // Snapshot da cotação ativa (ver orcamento_insumo_cotacoes) — só
  // preenchido em avulsos (composicao_id null); cópias embutidas em
  // composições não carregam cotação própria.
  fornecedor?: string | null
  data_cotacao?: string | null
  cotacao_observacoes?: string | null
  cotacao_id?: string | null
  // Snapshot de orcamento_insumo_cotacoes.estimado (cotação ativa) — nunca
  // escrito diretamente por um checkbox: é copiado aqui (avulso e cópias
  // embutidas em composição com o mesmo código) sempre que uma cotação é
  // registrada com "preço estimado" marcado. Ver upsertAvulsoInsumo.
  estimado?: boolean
  estimado_motivo?: string | null
  created_at: string
}

/**
 * Uma cotação registrada para um insumo avulso do orçamento — histórico
 * completo (nunca apagado de verdade, só soft delete), não apenas a mudança
 * de preço. `ativa` indica se é a cotação em vigor (a que está copiada em
 * orcamento_insumos hoje).
 */
export interface OrcamentoInsumoCotacao {
  id: string
  orcamento_id: string
  codigo: string
  valor: number
  fornecedor: string | null
  data_cotacao: string | null
  observacoes: string | null
  ativa: boolean
  usuario: string | null
  created_at: string
  /** Preço provisório/sujeito a alteração — insumo com estimado=true não tem preço definitivo ainda. */
  estimado: boolean
  /** Motivo do preço estimado (texto livre) — null quando estimado=false ou não informado. */
  estimado_motivo: string | null
}

export interface OrcamentoComposicao {
  id: string
  orcamento_id: string
  codigo: string
  descricao: string
  unidade: string
  base: string | null
  // Calculado pelo motor ou na leitura
  custo_unitario: number
  calculado_em?: string | null
  codigo_original?: string | null
  created_at: string
}

export interface OrcamentoResumo {
  id: string
  codigo: string
  nome_obra: string
  cliente: string | null
  data: string
  bdi_global: number
}

export type CreateInsumoData = Omit<OrcamentoInsumo, 'id' | 'orcamento_id' | 'created_at'>
export type CreateComposicaoData = Omit<OrcamentoComposicao, 'id' | 'orcamento_id' | 'created_at' | 'custo_unitario'>

export type UpdateInsumoData = Partial<CreateInsumoData>
export type UpdateComposicaoData = Partial<CreateComposicaoData>

// ── Motor de Cálculo ──────────────────────────────────────────────────────────

/** Modos de operação do motor de cálculo. */
export type ModoCalculo = 'planilha' | 'todas' | 'forca' | 'limpar'

export interface CalculoOptions {
  modo: ModoCalculo
  planilhaId?: string | null
}

export interface OrfaosDetectados {
  composicoes: { id: string; codigo: string; descricao: string }[]
  insumos: number
}

// ── Planilha com totais persistidos ──────────────────────────────────────────

export interface OrcamentoPlanilhaComTotais extends OrcamentoPlanilha {
  total_custo: number | null
  total_com_bdi: number | null
  invalidado_em: string | null
  ultima_calculo_em: string | null
}

// ── Log de auditoria ─────────────────────────────────────────────────────────

export type { ConsistenciaReport } from './motor-calculo'

export interface OrcamentoLog {
  id: string
  orcamento_id: string
  planilha_id: string | null
  user_id: string | null
  acao: string
  mensagem: string
  detalhes: Record<string, unknown> | null
  created_at: string
}
