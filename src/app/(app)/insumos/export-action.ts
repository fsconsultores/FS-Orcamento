'use server'

import { createClient } from '@/lib/supabase/server'
import { baseLabelFromOrgao } from '@/components/base-labels'
import type { InsumoComBase } from '@/lib/supabase/types'

/**
 * Busca todos os insumos que casam com os filtros da tela (não só a página
 * atual) e monta as linhas da planilha de export. Antes rodava sempre, em
 * toda visita a /insumos, mesmo sem o usuário clicar em "Exportar" — em
 * bases grandes (SINAPI tem dezenas de milhares de itens) isso significava
 * até ~20 round-trips sequenciais de 1000 linhas cada SÓ para preparar um
 * botão que talvez nunca fosse clicado. Agora só roda sob demanda.
 */
export async function exportInsumosAction(filtros: { q?: string; orgao?: string; origem?: string }) {
  const supabase = await createClient()
  const sb = supabase as any

  const { data: basesRaw } = await sb
    .from('tabela_bases')
    .select('id, orgao')

  let baseIdFiltro: string | null = null
  if (filtros.orgao && filtros.orgao !== 'SEM_BASE') {
    const match = (basesRaw ?? []).find((b: { orgao: string }) => b.orgao === filtros.orgao)
    if (match) baseIdFiltro = match.id
  }

  function addFilters(query: any) {
    if (filtros.q) query = query.or(`codigo.ilike.%${filtros.q}%,descricao.ilike.%${filtros.q}%`)
    if (filtros.orgao === 'SEM_BASE') query = query.is('base_id', null)
    else if (baseIdFiltro) query = query.eq('base_id', baseIdFiltro)
    if (filtros.origem) query = query.eq('base_origem', filtros.origem)
    return query
  }

  const insumosExport: InsumoComBase[] = []
  const BATCH = 1000
  let start = 0
  while (true) {
    const { data, error } = await addFilters(
      sb.from('tabela_insumos')
        .select('id, codigo, descricao, grupo, unidade, preco_base, data_referencia, base_id, base_origem, tabela_bases(orgao, tipo_base)')
        .order('codigo')
        .range(start, start + BATCH - 1)
    )
    if (error) throw new Error(`Erro ao buscar insumos para export: ${error.message}`)
    insumosExport.push(...((data ?? []) as InsumoComBase[]))
    if ((data?.length ?? 0) < BATCH) break
    start += BATCH
  }

  return insumosExport.map((ins) => ({
    'Código': ins.codigo,
    'Descrição': ins.descricao,
    'Grupo': ins.grupo ?? '',
    'Unidade': ins.unidade,
    'Custo': ins.preco_base,
    'Base': ins.base_origem ?? (ins.tabela_bases ? baseLabelFromOrgao(ins.tabela_bases.orgao) : ''),
    'Data Ref.': ins.data_referencia
      ? new Date(ins.data_referencia).toLocaleDateString('pt-BR')
      : '',
  }))
}
