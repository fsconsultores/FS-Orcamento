export interface Database {
  public: {
    Tables: {
      tabela_insumos: {
        Row: {
          id: string;
          codigo: string;
          descricao: string;
          unidade: string;
          preco_base: number;
          fonte: string | null;
          data_referencia: string | null;
          grupo: string | null;
          observacao: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          codigo: string;
          descricao: string;
          unidade: string;
          preco_base?: number;
          fonte?: string | null;
          data_referencia?: string | null;
          grupo?: string | null;
          observacao?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          codigo?: string;
          descricao?: string;
          unidade?: string;
          preco_base?: number;
          fonte?: string | null;
          data_referencia?: string | null;
          grupo?: string | null;
          observacao?: string | null;
          created_at?: string;
        };
      };
      tabela_composicoes: {
        Row: {
          id: string;
          codigo: string;
          descricao: string;
          unidade: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          codigo: string;
          descricao: string;
          unidade: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          codigo?: string;
          descricao?: string;
          unidade?: string;
          created_at?: string;
        };
      };
      tabela_itens_composicao: {
        Row: {
          id: string;
          composicao_id: string;
          insumo_id: string;
          indice: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          composicao_id: string;
          insumo_id: string;
          indice: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          composicao_id?: string;
          insumo_id?: string;
          indice?: number;
          created_at?: string;
        };
      };
      tabela_orcamentos: {
        Row: {
          id: string;
          user_id: string;
          nome_obra: string;
          cliente: string | null;
          data: string;
          bdi_global: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          nome_obra: string;
          cliente?: string | null;
          data?: string;
          bdi_global?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          nome_obra?: string;
          cliente?: string | null;
          data?: string;
          bdi_global?: number;
          created_at?: string;
        };
      };
      tabela_itens_orcamento: {
        Row: {
          id: string;
          orcamento_id: string;
          composicao_id: string;
          quantidade: number;
          bdi_especifico: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          orcamento_id: string;
          composicao_id: string;
          quantidade: number;
          bdi_especifico?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          orcamento_id?: string;
          composicao_id?: string;
          quantidade?: number;
          bdi_especifico?: number | null;
          created_at?: string;
        };
      };
    };
      folders: {
        Row: { id: string; name: string; user_id: string; created_at: string };
        Insert: { id?: string; name: string; user_id: string; created_at?: string };
        Update: { id?: string; name?: string; user_id?: string; created_at?: string };
      };
      projects: {
        Row: { id: string; name: string; folder_id: string; created_at: string };
        Insert: { id?: string; name: string; folder_id: string; created_at?: string };
        Update: { id?: string; name?: string; folder_id?: string; created_at?: string };
      };
      budgets: {
        Row: { id: string; name: string; project_id: string; created_at: string };
        Insert: { id?: string; name: string; project_id: string; created_at?: string };
        Update: { id?: string; name?: string; project_id?: string; created_at?: string };
      };
      budget_items: {
        Row: { id: string; name: string; quantity: number; unit_cost: number; budget_id: string; created_at: string };
        Insert: { id?: string; name: string; quantity: number; unit_cost: number; budget_id: string; created_at?: string };
        Update: { id?: string; name?: string; quantity?: number; unit_cost?: number; budget_id?: string; created_at?: string };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export type Insumo = Database['public']['Tables']['tabela_insumos']['Row'];
export type Composicao = Database['public']['Tables']['tabela_composicoes']['Row'];
export type ItemComposicao = Database['public']['Tables']['tabela_itens_composicao']['Row'];
export type Orcamento = Database['public']['Tables']['tabela_orcamentos']['Row'];
export type ItemOrcamento = Database['public']['Tables']['tabela_itens_orcamento']['Row'];

export type ComposicaoComCusto = Composicao & { custo_unitario: number };

export type ItemOrcamentoComDetalhe = ItemOrcamento & {
  composicao: ComposicaoComCusto;
  custo_total: number;
  custo_com_bdi: number;
};

export type OrcamentoComTotal = Orcamento & {
  total_sem_bdi: number;
  total_com_bdi: number;
  itens_count: number;
};