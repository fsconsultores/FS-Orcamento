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
  created_at: string
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
