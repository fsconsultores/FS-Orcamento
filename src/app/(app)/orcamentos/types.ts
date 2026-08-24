export type OrcRow = {
  id: string;
  nome_obra: string;
  cliente: string | null;
  data: string;
  bdi_global: number;
  codigo: string;
  ultimo_acesso: string | null;
  created_at: string;
  tabela_itens_orcamento: { id: string }[];
  is_favorito?: boolean;
  is_modelo?: boolean;
  user_id: string;
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
