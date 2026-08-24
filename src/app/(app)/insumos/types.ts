import type { InsumoComBase } from '@/lib/supabase/types';

export const INSUMOS_PAGE_SIZE = 100;

export interface InsumosFilters {
  q: string;
  orgao: string;
  origem: string;
  favoritos: boolean;
  semPreco: boolean;
}

export interface BaseRow {
  id: string;
  nome: string;
  orgao: string;
  tipo_base: string;
}

export interface InsumosPageData {
  insumos: InsumoComBase[];
  total: number;
  semBase: number;
  bases: BaseRow[];
  baseOptions: { orgao: string; label: string }[];
  basesPropias: number;
  custoMedio: number;
}

export function defaultInsumosFilters(): InsumosFilters {
  return { q: '', orgao: '', origem: '', favoritos: false, semPreco: false };
}
