import type { ModeloAcrescimo } from '@/lib/orcamento/modelo-acrescimo';

export type OrcRow = {
  id: string;
  nome_obra: string;
  cliente: string | null;
  data: string;
  bdi_global: number;
  modelo_acrescimo: ModeloAcrescimo;
  codigo: string;
  ultimo_acesso: string | null;
  created_at: string;
  tabela_itens_orcamento: { id: string }[];
  is_favorito?: boolean;
  is_modelo?: boolean;
  user_id: string;
  grupo_id?: string;
  numero_revisao?: number;
  /** Quantas revisões a família deste orçamento tem — presente só na linha
   * representante (a de maior numero_revisao) depois do agrupamento em
   * fetchOrcamentos; undefined/1 = orçamento sem outras revisões. */
  revisaoCount?: number;
};

export interface OrcamentosFilters {
  q: string;
  favoritos: boolean;
  modelos: boolean;
  semVersao: boolean;
}

export interface OrcamentosData {
  orcamentos: OrcRow[];
  totaisMap: Record<string, number>;
}

export function defaultOrcamentosFilters(): OrcamentosFilters {
  return { q: '', favoritos: false, modelos: false, semVersao: false };
}
