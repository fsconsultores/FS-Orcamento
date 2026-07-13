// Script único de manutenção: recalcula total_custo/total_com_bdi de TODAS as
// planilhas de TODOS os orçamentos, usando a mesma fórmula corrigida de
// src/lib/orcamento/motor-calculo.ts (persistirTotaisPlanilha), via service
// role key (ignora RLS, pois precisa varrer dados de todos os usuários).
//
// Uso: node scripts/backfill-totais-planilha.mjs [--dry-run]

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env')
  process.exit(1)
}

const dryRun = process.argv.includes('--dry-run')
const supabase = createClient(url, serviceKey)

async function main() {
  const { data: planilhas, error } = await supabase
    .from('orcamento_planilhas')
    .select('id, orcamento_id, nome, bdi_global, total_custo, total_com_bdi')
  if (error) throw new Error(`Erro ao listar planilhas: ${error.message}`)

  console.log(`${planilhas.length} planilha(s) encontrada(s).`)

  let alteradas = 0
  for (const planilha of planilhas) {
    const bdi = planilha.bdi_global ?? 0

    const { data: itens, error: itensErr } = await supabase
      .from('orcamento_estrutura')
      .select('custo_unitario, quantidade, bdi_especifico')
      .eq('orcamento_id', planilha.orcamento_id)
      .eq('planilha_id', planilha.id)
      .eq('tipo', 'item')
    if (itensErr) {
      console.error(`Erro ao ler itens da planilha ${planilha.id}: ${itensErr.message}`)
      continue
    }

    let totalCusto = 0
    let totalComBdi = 0
    for (const item of itens ?? []) {
      const custo = (item.custo_unitario ?? 0) * (item.quantidade ?? 0)
      const bdiItem = item.bdi_especifico ?? bdi
      totalCusto += custo
      totalComBdi += custo * (1 + bdiItem / 100)
    }

    const antesCusto = planilha.total_custo ?? 0
    const antesComBdi = planilha.total_com_bdi ?? 0
    const mudou = Math.abs(antesCusto - totalCusto) > 0.005 || Math.abs(antesComBdi - totalComBdi) > 0.005

    if (mudou) {
      alteradas++
      console.log(
        `[${dryRun ? 'DRY-RUN' : 'UPDATE'}] planilha "${planilha.nome}" (${planilha.id}) — ` +
        `custo: ${antesCusto.toFixed(2)} -> ${totalCusto.toFixed(2)} | ` +
        `com BDI: ${antesComBdi.toFixed(2)} -> ${totalComBdi.toFixed(2)}`
      )
      if (!dryRun) {
        const { error: updErr } = await supabase
          .from('orcamento_planilhas')
          .update({ total_custo: totalCusto, total_com_bdi: totalComBdi, invalidado_em: null })
          .eq('id', planilha.id)
        if (updErr) console.error(`Erro ao atualizar planilha ${planilha.id}: ${updErr.message}`)
      }
    }
  }

  console.log(`\nConcluído. ${alteradas} de ${planilhas.length} planilha(s) tinham total desatualizado${dryRun ? ' (nenhuma alteração gravada — dry-run)' : ' e foram corrigidas'}.`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
