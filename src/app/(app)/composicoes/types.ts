export const COMPOSICOES_PAGE_SIZE = 100;

export interface ComposicoesFilters {
  q: string;
  orgao: string;
  origem: string;
  favoritos: boolean;
  incompletas: boolean;
}

export interface BaseRow {
  id: string;
  nome: string;
  orgao: string;
  tipo_base: string;
}

export type ComposicaoView = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  base_id: string | null;
  orgao: string | null;
  tipo_base: string | null;
  custo_unitario: number;
  base_origem: string | null;
  is_favorito?: boolean;
  incompleta?: boolean;
};

export interface ComposicoesPageData {
  composicoes: ComposicaoView[];
  total: number;
  semBase: number;
  bases: BaseRow[];
  baseOptions: { orgao: string; label: string }[];
  basesPropias: number;
  custoMedioPagina: number;
}

export function defaultComposicoesFilters(): ComposicoesFilters {
  return { q: '', orgao: '', origem: '', favoritos: false, incompletas: false };
}
