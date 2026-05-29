import { createClient } from '@/lib/supabase/server'
import { calcularCurvaAbc } from '@/lib/curva-abc'
import { CurvaAbcView } from './curva-abc-view'

export default async function CurvaAbcPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const sb = supabase as any

  // 1. Planilha + composições em paralelo
  const [{ data: estrutura }, { data: composicoes }] = await Promise.all([
    sb.from('orcamento_estrutura')
      .select('codigo, descricao, unidade, quantidade, custo_unitario')
      .eq('orcamento_id', orcamentoId)
      .eq('tipo', 'item'),
    sb.from('orcamento_composicoes')
      .select('id, codigo')
      .eq('orcamento_id', orcamentoId),
  ])

  type EstItem = { codigo: string | null; descricao: string; unidade: string | null; quantidade: number | null; custo_unitario: number | null }
  const estItems: EstItem[] = estrutura ?? []

  // Mapa composição.id → codigo  +  set de todos os códigos de composição
  const compIdToCode = new Map<string, string>()
  const compCodesSet = new Set<string>()
  for (const c of (composicoes ?? []) as { id: string; codigo: string }[]) {
    compIdToCode.set(c.id, c.codigo)
    compCodesSet.add(c.codigo)
  }

  // 2. Insumos dentro de composições (paginado) — necessário antes do split
  type InsumoRow = { codigo: string; descricao: string; unidade: string | null; custo: number; indice: number; composicao_id: string; grupo: string | null }
  const allInsumos: InsumoRow[] = []
  {
    const BATCH = 1000
    let start = 0
    while (true) {
      const { data } = await sb
        .from('orcamento_insumos')
        .select('codigo, descricao, unidade, custo, indice, composicao_id, grupo')
        .eq('orcamento_id', orcamentoId)
        .not('composicao_id', 'is', null)
        .range(start, start + BATCH - 1)
      if (!data || data.length === 0) break
      allInsumos.push(...data)
      if (data.length < BATCH) break
      start += BATCH
    }
  }

  // Composições que têm sub-insumos reais → são serviços de verdade
  const compIdsComInsumos = new Set(allInsumos.map(ins => ins.composicao_id))
  const compCodesServico = new Set<string>()
  for (const [id, codigo] of compIdToCode) {
    if (compIdsComInsumos.has(id)) compCodesServico.add(codigo)
  }

  // 3. Split: serviço = tem composição com sub-insumos; insumo direto = todo o resto
  const compItems = estItems.filter(item => item.codigo && compCodesServico.has(item.codigo))
  const directInsumoItems = estItems.filter(item => !item.codigo || !compCodesServico.has(item.codigo))

  // 4. ABC de Serviços
  const compMap = new Map<string, { descricao: string; unidade: string | null; quantidade: number; custo_unitario: number }>()
  for (const item of compItems) {
    const key = item.codigo ?? `__nocode__${item.descricao}`
    const qty = item.quantidade ?? 0
    const cu = item.custo_unitario ?? 0
    const existing = compMap.get(key)
    if (existing) {
      existing.quantidade += qty
    } else {
      compMap.set(key, { descricao: item.descricao, unidade: item.unidade, quantidade: qty, custo_unitario: cu })
    }
  }

  const abcServicos = calcularCurvaAbc(
    Array.from(compMap.entries()).map(([k, d]) => ({
      codigo: k.startsWith('__nocode__') ? null : k,
      descricao: d.descricao,
      unidade: d.unidade,
      quantidade: d.quantidade,
      custo_unitario: d.custo_unitario,
    }))
  )

  // 5. ABC de Insumos
  // Quantidade de cada composição usada na planilha
  const compQtyByCode = new Map<string, number>()
  for (const item of compItems) {
    if (item.codigo) {
      compQtyByCode.set(item.codigo, (compQtyByCode.get(item.codigo) ?? 0) + (item.quantidade ?? 0))
    }
  }

  type InsumoAccum = { descricao: string; unidade: string | null; custo_unitario: number; quantidade: number }
  const insumoMap = new Map<string, InsumoAccum>()

  for (const ins of allInsumos) {
    // Exclui sub-composições (código de composição) e grupos de serviço (S, SER…)
    if (compCodesSet.has(ins.codigo)) continue
    const g = (ins.grupo ?? '').trim().toUpperCase()
    if (g && (g === 'S' || g.startsWith('SER') || g.startsWith('SERVIC'))) continue

    const compCodigo = compIdToCode.get(ins.composicao_id)
    if (!compCodigo) continue
    const qtyComp = compQtyByCode.get(compCodigo) ?? 0
    if (qtyComp === 0) continue

    const qtdUsada = ins.indice * qtyComp
    const existing = insumoMap.get(ins.codigo)
    if (existing) {
      existing.quantidade += qtdUsada
    } else {
      insumoMap.set(ins.codigo, {
        descricao: ins.descricao,
        unidade: ins.unidade,
        custo_unitario: ins.custo,
        quantidade: qtdUsada,
      })
    }
  }

  // Insumos diretos da planilha (itens sem composição com sub-insumos)
  for (const item of directInsumoItems) {
    const key = item.codigo ?? `__nocode__${item.descricao}`
    const qty = item.quantidade ?? 0
    const custo = item.custo_unitario ?? 0
    const existing = insumoMap.get(key)
    if (existing) {
      existing.quantidade += qty
    } else {
      insumoMap.set(key, {
        descricao: item.descricao,
        unidade: item.unidade,
        custo_unitario: custo,
        quantidade: qty,
      })
    }
  }

  const abcInsumos = calcularCurvaAbc(
    Array.from(insumoMap.entries()).map(([k, d]) => ({
      codigo: k.startsWith('__nocode__') ? null : k,
      descricao: d.descricao,
      unidade: d.unidade,
      quantidade: d.quantidade,
      custo_unitario: d.custo_unitario,
    }))
  )

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Curva ABC</h1>
        <p className="text-sm text-gray-500 mt-1">
          Classificação dos itens por impacto financeiro no orçamento.
        </p>
      </div>
      <CurvaAbcView abcServicos={abcServicos} abcInsumos={abcInsumos} />
    </div>
  )
}
