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

  // 1. Itens da planilha (composições com quantidade)
  const { data: estrutura } = await sb
    .from('orcamento_estrutura')
    .select('codigo, descricao, unidade, quantidade, custo_unitario')
    .eq('orcamento_id', orcamentoId)
    .eq('tipo', 'item')

  type EstItem = { codigo: string | null; descricao: string; unidade: string | null; quantidade: number | null; custo_unitario: number | null }
  const estItems: EstItem[] = estrutura ?? []

  // 2. ABC de composições — agrupa por código, soma quantidades
  const compMap = new Map<string, { descricao: string; unidade: string | null; quantidade: number; custo_unitario: number }>()
  for (const item of estItems) {
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

  const abcComposicoes = calcularCurvaAbc(
    Array.from(compMap.entries()).map(([k, d]) => ({
      codigo: k.startsWith('__nocode__') ? null : k,
      descricao: d.descricao,
      unidade: d.unidade,
      quantidade: d.quantidade,
      custo_unitario: d.custo_unitario,
    }))
  )

  // 3. ABC de insumos
  // Mapa: composição.codigo → total quantidade usada na planilha
  const compQtyByCode = new Map<string, number>()
  for (const item of estItems) {
    if (item.codigo) {
      compQtyByCode.set(item.codigo, (compQtyByCode.get(item.codigo) ?? 0) + (item.quantidade ?? 0))
    }
  }

  // Mapa: composição.id → composição.codigo
  const { data: composicoes } = await sb
    .from('orcamento_composicoes')
    .select('id, codigo')
    .eq('orcamento_id', orcamentoId)

  const compIdToCode = new Map<string, string>()
  for (const c of (composicoes ?? []) as { id: string; codigo: string }[]) {
    compIdToCode.set(c.id, c.codigo)
  }

  // Busca insumos de composições (não avulsos), paginado
  type InsumoRow = { codigo: string; descricao: string; unidade: string | null; custo: number; indice: number; composicao_id: string }
  const allInsumos: InsumoRow[] = []
  {
    const BATCH = 1000
    let start = 0
    while (true) {
      const { data } = await sb
        .from('orcamento_insumos')
        .select('codigo, descricao, unidade, custo, indice, composicao_id')
        .eq('orcamento_id', orcamentoId)
        .not('composicao_id', 'is', null)
        .range(start, start + BATCH - 1)
      if (!data || data.length === 0) break
      allInsumos.push(...data)
      if (data.length < BATCH) break
      start += BATCH
    }
  }

  // Calcula valor de cada insumo: custo × indice × qty_composicao_na_planilha
  type InsumoAccum = { descricao: string; unidade: string | null; custo_unitario: number; quantidade: number }
  const insumoMap = new Map<string, InsumoAccum>()

  for (const ins of allInsumos) {
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

  const abcInsumos = calcularCurvaAbc(
    Array.from(insumoMap.entries()).map(([codigo, d]) => ({
      codigo,
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
      <CurvaAbcView abcComposicoes={abcComposicoes} abcInsumos={abcInsumos} />
    </div>
  )
}
