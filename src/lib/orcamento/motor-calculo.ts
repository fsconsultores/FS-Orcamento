import type { SupabaseClient } from '@supabase/supabase-js'

export interface LogEntry {
  msg: string
  ts: number
}

export interface CalculoResult {
  ok: boolean
  logs: LogEntry[]
  composicoesRecalculadas: number
  itensAtualizados: number
  erro?: string
}

/**
 * Motor de cálculo do orçamento.
 *
 * Ordem de execução: insumos → composições → planilha
 *
 * Delta detection: compara custo_atualizado_em de cada insumo com
 * calculado_em da sua composição. Só recalcula as composições cujos
 * insumos foram alterados após o último cálculo, propagando dirtiness
 * para composições-pai que dependem de sub-composições sujas.
 *
 * Se planilha_id for fornecido, apenas os itens dessa planilha são
 * atualizados em orcamento_estrutura. As composições são sempre
 * recalculadas no nível do orçamento (base compartilhada).
 */
export async function executarCalculo(
  supabase: SupabaseClient,
  orcamentoId: string,
  planilhaId: string | null
): Promise<CalculoResult> {
  const logs: LogEntry[] = []
  const log = (msg: string) => logs.push({ msg, ts: Date.now() })

  try {
    log('Iniciando cálculo...')

    // ── 1. Buscar todas as composições ──────────────────────────────────────
    const { data: composicoes, error: compErr } = await supabase
      .from('orcamento_composicoes')
      .select('id, codigo, calculado_em')
      .eq('orcamento_id', orcamentoId)
      .order('codigo')

    if (compErr) throw new Error(`Erro ao buscar composições: ${compErr.message}`)

    const allComps = (composicoes ?? []) as {
      id: string
      codigo: string
      calculado_em: string | null
    }[]

    // ── 2. Buscar insumos vinculados a composições ───────────────────────────
    log('Verificando insumos alterados...')

    const compIds = allComps.map(c => c.id)
    const allInsData: {
      composicao_id: string
      codigo: string
      custo: number
      indice: number
      custo_atualizado_em: string | null
    }[] = []

    for (let i = 0; i < compIds.length; i += 100) {
      const { data: lote } = await supabase
        .from('orcamento_insumos')
        .select('composicao_id, codigo, custo, indice, custo_atualizado_em')
        .in('composicao_id', compIds.slice(i, i + 100))
      allInsData.push(...((lote ?? []) as typeof allInsData))
    }

    // ── 3. Delta detection ────────────────────────────────────────────────────
    // Agrupa insumos por composicao_id para comparação eficiente
    const insByComp = new Map<string, typeof allInsData>()
    for (const ins of allInsData) {
      if (!insByComp.has(ins.composicao_id)) insByComp.set(ins.composicao_id, [])
      insByComp.get(ins.composicao_id)!.push(ins)
    }

    // Mapeia código → id para detectar dirtiness em sub-composições
    const codigoToId = new Map(allComps.map(c => [c.codigo, c.id]))

    const dirtyIds = new Set<string>()
    for (const comp of allComps) {
      // Nunca foi calculado → forçar recálculo
      if (!comp.calculado_em) { dirtyIds.add(comp.id); continue }
      const calculadoTs = new Date(comp.calculado_em).getTime()
      const insumos = insByComp.get(comp.id) ?? []
      for (const ins of insumos) {
        if (ins.custo_atualizado_em && new Date(ins.custo_atualizado_em).getTime() > calculadoTs) {
          dirtyIds.add(comp.id)
          break
        }
      }
    }

    // Propagar dirtiness: se sub-composição ficou suja, pai também fica
    let propagou = true
    while (propagou) {
      propagou = false
      for (const ins of allInsData) {
        const subCompId = codigoToId.get(ins.codigo)
        if (subCompId && dirtyIds.has(subCompId) && !dirtyIds.has(ins.composicao_id)) {
          dirtyIds.add(ins.composicao_id)
          propagou = true
        }
      }
    }

    log(`Verificando insumos alterados... ${dirtyIds.size} composição(ões) impactada(s).`)

    if (dirtyIds.size === 0 && allComps.length > 0) {
      log('Nenhuma alteração detectada desde o último cálculo.')
      log('Cálculo concluído com sucesso.')
      return { ok: true, logs, composicoesRecalculadas: 0, itensAtualizados: 0 }
    }

    // ── 4. Recalcular custos (3 passes para sub-composições aninhadas) ───────
    log('Recalculando composições...')

    // Busca preços dos insumos avulsos (tabela de preços do orçamento)
    const codigos = [...new Set(allInsData.map(i => i.codigo).filter(Boolean))]
    const precoMap = new Map<string, number>()

    for (let i = 0; i < codigos.length; i += 500) {
      const { data: avs } = await supabase
        .from('orcamento_insumos')
        .select('codigo, custo')
        .eq('orcamento_id', orcamentoId)
        .is('composicao_id', null)
        .in('codigo', codigos.slice(i, i + 500))
      for (const av of (avs ?? []) as { codigo: string; custo: number }[]) {
        precoMap.set(av.codigo, av.custo)
      }
    }

    // Pass 1 — custo base usando apenas insumos avulsos
    const custoPass1: Record<string, number> = {}
    for (const ins of allInsData) {
      const c = precoMap.has(ins.codigo) ? precoMap.get(ins.codigo)! : (ins.custo ?? 0)
      custoPass1[ins.composicao_id] = (custoPass1[ins.composicao_id] ?? 0) + c * (ins.indice ?? 1)
    }

    // Pass 2 — enriquece precoMap com custo_unitario das sub-composições
    for (const comp of allComps) {
      if (!precoMap.has(comp.codigo) && custoPass1[comp.id] !== undefined) {
        precoMap.set(comp.codigo, custoPass1[comp.id])
      }
    }

    // Pass 3 — recalcula com precoMap completo (avulsos + sub-composições)
    const custoFinal: Record<string, number> = {}
    for (const ins of allInsData) {
      const c = precoMap.has(ins.codigo) ? precoMap.get(ins.codigo)! : (ins.custo ?? 0)
      custoFinal[ins.composicao_id] = (custoFinal[ins.composicao_id] ?? 0) + c * (ins.indice ?? 1)
    }

    // ── 5. Persistir custo_unitario + calculado_em nas composições sujas ─────
    const agora = new Date().toISOString()
    const dirtyComps = allComps.filter(c => dirtyIds.has(c.id))

    const BATCH_COMP = 20
    for (let i = 0; i < dirtyComps.length; i += BATCH_COMP) {
      const lote = dirtyComps.slice(i, i + BATCH_COMP)
      const results = await Promise.all(
        lote.map(c =>
          supabase
            .from('orcamento_composicoes')
            .update({ custo_unitario: custoFinal[c.id] ?? 0, calculado_em: agora })
            .eq('id', c.id)
        )
      )
      const falha = results.find(r => r.error)
      if (falha?.error) throw new Error(`Erro ao salvar composição: ${falha.error.message}`)
    }

    // ── 6. Atualizar orcamento_estrutura ─────────────────────────────────────
    log('Atualizando planilha...')

    const custoPorCodigo = new Map(
      dirtyComps.map(c => [c.codigo, custoFinal[c.id] ?? 0])
    )

    const { data: itens, error: itensErr } = planilhaId
      ? await supabase
          .from('orcamento_estrutura')
          .select('id, codigo, custo_unitario')
          .eq('orcamento_id', orcamentoId)
          .eq('planilha_id', planilhaId)
          .eq('tipo', 'item')
          .not('codigo', 'is', null)
      : await supabase
          .from('orcamento_estrutura')
          .select('id, codigo, custo_unitario')
          .eq('orcamento_id', orcamentoId)
          .eq('tipo', 'item')
          .not('codigo', 'is', null)

    if (itensErr) throw new Error(`Erro ao buscar itens da planilha: ${itensErr.message}`)

    const updates = ((itens ?? []) as { id: string; codigo: string; custo_unitario: number | null }[])
      .filter(item => custoPorCodigo.has(item.codigo) && custoPorCodigo.get(item.codigo) !== item.custo_unitario)
      .map(item => ({ id: item.id, custo_unitario: custoPorCodigo.get(item.codigo)! }))

    if (updates.length > 0) {
      log('Atualizando totais...')
      const BATCH_EST = 20
      for (let i = 0; i < updates.length; i += BATCH_EST) {
        const lote = updates.slice(i, i + BATCH_EST)
        const results = await Promise.all(
          lote.map(u =>
            supabase.from('orcamento_estrutura').update({ custo_unitario: u.custo_unitario }).eq('id', u.id)
          )
        )
        const falha = results.find(r => r.error)
        if (falha?.error) throw new Error(`Erro ao atualizar planilha: ${falha.error.message}`)
      }
    }

    log('Cálculo concluído com sucesso.')
    return {
      ok: true,
      logs,
      composicoesRecalculadas: dirtyIds.size,
      itensAtualizados: updates.length,
    }
  } catch (err) {
    const msg = (err as Error).message
    log(`Erro: ${msg}`)
    return {
      ok: false,
      logs,
      composicoesRecalculadas: 0,
      itensAtualizados: 0,
      erro: msg,
    }
  }
}
