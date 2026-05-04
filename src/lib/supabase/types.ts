export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      tabela_bases: {
        Row: {
          id: string
          nome: string
          orgao: string
          tipo_base: 'externa' | 'propria'
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string | undefined
          nome: string
          orgao: string
          tipo_base: 'externa' | 'propria'
          user_id?: string | null | undefined
          created_at?: string | undefined
        }
        Update: {
          id?: string | undefined
          nome?: string | undefined
          orgao?: string | undefined
          tipo_base?: 'externa' | 'propria' | undefined
          user_id?: string | null | undefined
          created_at?: string | undefined
        }
        Relationships: []
      }
      tabela_insumos: {
        Row: {
          id: string
          codigo: string
          descricao: string
          unidade: string
          preco_base: number
          fonte: string | null
          data_referencia: string | null
          grupo: string | null
          observacao: string | null
          base_id: string | null
          created_at: string
        }
        Insert: {
          id?: string | undefined
          codigo: string
          descricao: string
          unidade: string
          preco_base?: number | undefined
          fonte?: string | null | undefined
          data_referencia?: string | null | undefined
          grupo?: string | null | undefined
          observacao?: string | null | undefined
          base_id?: string | null | undefined
          created_at?: string | undefined
        }
        Update: {
          id?: string | undefined
          codigo?: string | undefined
          descricao?: string | undefined
          unidade?: string | undefined
          preco_base?: number | undefined
          fonte?: string | null | undefined
          data_referencia?: string | null | undefined
          grupo?: string | null | undefined
          observacao?: string | null | undefined
          base_id?: string | null | undefined
          created_at?: string | undefined
        }
        Relationships: []
      }
      tabela_composicoes: {
        Row: {
          id: string
          codigo: string
          descricao: string
          unidade: string
          base_id: string | null
          created_at: string
        }
        Insert: {
          id?: string | undefined
          codigo: string
          descricao: string
          unidade: string
          base_id?: string | null | undefined
          created_at?: string | undefined
        }
        Update: {
          id?: string | undefined
          codigo?: string | undefined
          descricao?: string | undefined
          unidade?: string | undefined
          base_id?: string | null | undefined
          created_at?: string | undefined
        }
        Relationships: []
      }
      tabela_itens_composicao: {
        Row: {
          id: string
          composicao_id: string
          insumo_id: string
          indice: number
          created_at: string
        }
        Insert: {
          id?: string | undefined
          composicao_id: string
          insumo_id: string
          indice: number
          created_at?: string | undefined
        }
        Update: {
          id?: string | undefined
          composicao_id?: string | undefined
          insumo_id?: string | undefined
          indice?: number | undefined
          created_at?: string | undefined
        }
        Relationships: [
          {
            foreignKeyName: "tabela_itens_composicao_composicao_id_fkey"
            columns: ["composicao_id"]
            isOneToOne: false
            referencedRelation: "tabela_composicoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabela_itens_composicao_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "tabela_insumos"
            referencedColumns: ["id"]
          }
        ]
      }
      tabela_orcamentos: {
        Row: {
          id: string
          user_id: string
          nome_obra: string
          cliente: string | null
          data: string
          bdi_global: number
          codigo: string
          created_at: string
        }
        Insert: {
          id?: string | undefined
          user_id: string
          nome_obra: string
          cliente?: string | null | undefined
          data?: string | undefined
          bdi_global?: number | undefined
          codigo?: string | undefined
          created_at?: string | undefined
        }
        Update: {
          id?: string | undefined
          user_id?: string | undefined
          nome_obra?: string | undefined
          cliente?: string | null | undefined
          data?: string | undefined
          bdi_global?: number | undefined
          codigo?: string | undefined
          created_at?: string | undefined
        }
        Relationships: []
      }
      tabela_itens_orcamento: {
        Row: {
          id: string
          orcamento_id: string
          composicao_id: string
          quantidade: number
          bdi_especifico: number | null
          created_at: string
        }
        Insert: {
          id?: string | undefined
          orcamento_id: string
          composicao_id: string
          quantidade: number
          bdi_especifico?: number | null | undefined
          created_at?: string | undefined
        }
        Update: {
          id?: string | undefined
          orcamento_id?: string | undefined
          composicao_id?: string | undefined
          quantidade?: number | undefined
          bdi_especifico?: number | null | undefined
          created_at?: string | undefined
        }
        Relationships: [
          {
            foreignKeyName: "tabela_itens_orcamento_orcamento_id_fkey"
            columns: ["orcamento_id"]
            isOneToOne: false
            referencedRelation: "tabela_orcamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tabela_itens_orcamento_composicao_id_fkey"
            columns: ["composicao_id"]
            isOneToOne: false
            referencedRelation: "tabela_composicoes"
            referencedColumns: ["id"]
          }
        ]
      }
      folders: {
        Row: { id: string; name: string; user_id: string; created_at: string }
        Insert: { id?: string | undefined; name: string; user_id: string; created_at?: string | undefined }
        Update: { id?: string | undefined; name?: string | undefined; user_id?: string | undefined; created_at?: string | undefined }
        Relationships: []
      }
      projects: {
        Row: { id: string; name: string; folder_id: string; created_at: string }
        Insert: { id?: string | undefined; name: string; folder_id: string; created_at?: string | undefined }
        Update: { id?: string | undefined; name?: string | undefined; folder_id?: string | undefined; created_at?: string | undefined }
        Relationships: []
      }
      budgets: {
        Row: { id: string; name: string; project_id: string; created_at: string }
        Insert: { id?: string | undefined; name: string; project_id: string; created_at?: string | undefined }
        Update: { id?: string | undefined; name?: string | undefined; project_id?: string | undefined; created_at?: string | undefined }
        Relationships: []
      }
      budget_items: {
        Row: { id: string; name: string; quantity: number; unit_cost: number; budget_id: string; created_at: string }
        Insert: { id?: string | undefined; name: string; quantity: number; unit_cost: number; budget_id: string; created_at?: string | undefined }
        Update: { id?: string | undefined; name?: string | undefined; quantity?: number | undefined; unit_cost?: number | undefined; budget_id?: string | undefined; created_at?: string | undefined }
        Relationships: []
      }
    }
    Views: {
      vw_custo_composicao: {
        Row: {
          id: string | null
          codigo: string | null
          descricao: string | null
          unidade: string | null
          base_id: string | null
          orgao: string | null
          tipo_base: string | null
          custo_unitario: number | null
        }
        Relationships: []
      }
      vw_total_orcamento: {
        Row: {
          orcamento_id: string | null
          total_com_bdi: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_or_create_propria_base: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Base = Database['public']['Tables']['tabela_bases']['Row']
export type Insumo = Database['public']['Tables']['tabela_insumos']['Row']
export type Composicao = Database['public']['Tables']['tabela_composicoes']['Row']
export type ItemComposicao = Database['public']['Tables']['tabela_itens_composicao']['Row']
export type Orcamento = Database['public']['Tables']['tabela_orcamentos']['Row']
export type ItemOrcamento = Database['public']['Tables']['tabela_itens_orcamento']['Row']

export type InsumoComBase = Insumo & {
  tabela_bases: { orgao: string; tipo_base: string } | null
}

export type ComposicaoComCusto = Composicao & { custo_unitario: number }

export type ComposicaoComBase = Composicao & {
  custo_unitario: number
  orgao: string | null
  tipo_base: string | null
}

export type ItemOrcamentoComDetalhe = ItemOrcamento & {
  composicao: ComposicaoComCusto
  custo_total: number
  custo_com_bdi: number
}

export type OrcamentoComTotal = Orcamento & {
  total_sem_bdi: number
  total_com_bdi: number
  itens_count: number
}
