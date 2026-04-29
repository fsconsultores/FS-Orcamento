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
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['tabela_insumos']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tabela_insumos']['Insert']>;
      };
      tabela_composicoes: {
        Row: {
          id: string;
          codigo: string;
          descricao: string;
          unidade: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['tabela_composicoes']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tabela_composicoes']['Insert']>;
      };
      tabela_itens_composicao: {
        Row: {
          id: string;
          composicao_id: string;
          insumo_id: string;
          indice: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['tabela_itens_composicao']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tabela_itens_composicao']['Insert']>;
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
        Insert: Omit<Database['public']['Tables']['tabela_orcamentos']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tabela_orcamentos']['Insert']>;
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
        Insert: Omit<Database['public']['Tables']['tabela_itens_orcamento']['Row'], 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['tabela_itens_orcamento']['Insert']>;
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
