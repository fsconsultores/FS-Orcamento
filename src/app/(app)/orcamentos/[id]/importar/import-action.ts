'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createComposicao, createInsumo } from '@/lib/orcamento'

export interface ImportInsumoRow {
  codigo: string
  descricao: string
  unidade: string
  custo: number
  grupo: string | null
  base: string | null
  data_ref: string | null
}

export interface ImportComposicaoRow {
  codigo: string
  descricao: string
  unidade: string
  base: string | null
  insumos: ImportInsumoRow[]
}

export interface ImportResult {
  composicoesCriadas: number
  insumosCriados: number
  erros: string[]
}

// Importação de insumos avulsos (sem composição pai)
export async function importarInsumos(
  orcamentoId: string,
  insumos: ImportInsumoRow[]
): Promise<ImportResult> {
  const supabase = await createClient()
  const sb = supabase as any

  const result: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [] }

  for (const ins of insumos) {
    try {
      await createInsumo(sb, orcamentoId, {
        composicao_id: null,
        codigo: ins.codigo,
        descricao: ins.descricao,
        unidade: ins.unidade,
        custo: ins.custo,
        grupo: ins.grupo,
        base: ins.base,
        data_ref: ins.data_ref,
      })
      result.insumosCriados++
    } catch (err) {
      result.erros.push(`Insumo "${ins.descricao}": ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  revalidatePath(`/orcamentos/${orcamentoId}/insumos`)
  return result
}

// Importação de composições com seus insumos vinculados
export async function importarComposicoes(
  orcamentoId: string,
  rows: ImportComposicaoRow[]
): Promise<ImportResult> {
  const supabase = await createClient()
  const sb = supabase as any

  const result: ImportResult = { composicoesCriadas: 0, insumosCriados: 0, erros: [] }

  for (const comp of rows) {
    try {
      const novaComp = await createComposicao(sb, orcamentoId, {
        codigo: comp.codigo,
        descricao: comp.descricao,
        unidade: comp.unidade,
        base: comp.base,
      })
      result.composicoesCriadas++

      // Cria os insumos vinculados à composição (inclusive os que não existiam antes)
      for (const ins of comp.insumos) {
        try {
          await createInsumo(sb, orcamentoId, {
            composicao_id: novaComp.id,
            codigo: ins.codigo,
            descricao: ins.descricao,
            unidade: ins.unidade,
            custo: ins.custo,
            grupo: ins.grupo,
            base: ins.base,
            data_ref: ins.data_ref,
          })
          result.insumosCriados++
        } catch (err) {
          result.erros.push(`Insumo "${ins.descricao}" (comp. ${comp.codigo}): ${err instanceof Error ? err.message : String(err)}`)
        }
      }
    } catch (err) {
      result.erros.push(`Composição "${comp.codigo}": ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  revalidatePath(`/orcamentos/${orcamentoId}/composicoes`)
  revalidatePath(`/orcamentos/${orcamentoId}/insumos`)
  return result
}
