export const BASE_DETAIL_PAGE_SIZE = 100;

export type BaseDetailTab = 'insumos' | 'composicoes';

export interface BaseDetailFilters {
  tab: BaseDetailTab;
  q: string;
}

export interface BaseInfo {
  id: string;
  nome: string;
  orgao: string;
  tipo_base: string;
}

export type BaseInsumoRow = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  grupo: string | null;
  preco_base: number;
  data_referencia: string | null;
};

export type BaseComposicaoRow = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  custo_unitario: number;
  incompleta?: boolean;
};

export interface BaseDetailData {
  base: BaseInfo;
  totalInsumos: number;
  totalComposicoes: number;
  total: number;
  insumos: BaseInsumoRow[];
  composicoes: BaseComposicaoRow[];
}
