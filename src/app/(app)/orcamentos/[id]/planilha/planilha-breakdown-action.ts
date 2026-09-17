'use server'

import { createClient } from '@/lib/supabase/server'
import { getCadernoData, type CadernoNode } from '@/lib/orcamento/caderno'

export interface BreakdownCusto {
  mat: number
  mo: number
  terceiros: number
}

/**
 * Material/Equipamento, Mão de Obra e Terceiros de cada item/grupo da
 * planilha (por id) — mesma classificação já usada na Planilha de Preços
 * Unitários do Caderno em PDF (classificarGrupo em caderno.ts, baseada no
 * campo `grupo` cadastrado em cada insumo: E=Equipamento, H/HH/MO*=Mão de
 * Obra, S/SER*=Serviço de Terceiros, o resto vira Material — nunca no texto
 * da descrição). Usado pelo "Exportar XLSX" da Planilha pra mostrar a mesma
 * quebra de custo que já existe no Caderno. Valores sem BDI
 * (totalMat/totalMo/totalTerceiros) — bate com o "R$ Total" que a Planilha
 * já exporta hoje, que também não aplica BDI.
 *
 * Reaproveita getCadernoData (já faz toda a busca de composições/insumos
 * pra montar esse breakdown) em vez de duplicar a classificação — mais
 * pesado do que o estritamente necessário pra só o breakdown, mas é uma
 * chamada única no clique de "Exportar", não um caminho quente.
 */
export async function getBreakdownCustoPlanilha(orcamentoId: string): Promise<Record<string, BreakdownCusto>> {
  const supabase = await createClient()
  const data = await getCadernoData(supabase, orcamentoId, null, { incluirEstimadosNaArvore: true })

  const out: Record<string, BreakdownCusto> = {}
  function percorrer(nodes: CadernoNode[]) {
    for (const n of nodes) {
      out[n.id] = { mat: n.totalMat, mo: n.totalMo, terceiros: n.totalTerceiros }
      percorrer(n.filhos)
    }
  }
  percorrer(data.arvoreCompleta)
  return out
}
