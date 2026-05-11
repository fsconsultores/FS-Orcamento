import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ComposicaoDetail } from './composicao-detail'

export default async function OrcamentoComposicaoDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; compId: string }>
  searchParams: Promise<{ addItem?: string }>
}) {
  const { id: orcamentoId, compId } = await params
  const { addItem } = await searchParams
  const sb = (await createClient()) as any

  const { data: composicao, error } = await sb
    .from('orcamento_composicoes')
    .select('id, codigo, descricao, unidade, base')
    .eq('id', compId)
    .eq('orcamento_id', orcamentoId)
    .single()

  if (error || !composicao) notFound()

  const { data: insumosRaw } = await sb
    .from('orcamento_insumos')
    .select('id, codigo, descricao, unidade, custo, indice, grupo')
    .eq('composicao_id', compId)
    .order('grupo')
    .order('descricao')

  type InsumoRow = { id: string; codigo: string; descricao: string; unidade: string; custo: number; indice: number; grupo: string | null }
  const insumosBase = (insumosRaw ?? []) as InsumoRow[]

  // Resolve custo efetivo via avulsos
  const codigos = [...new Set(insumosBase.map(i => i.codigo).filter(Boolean))]
  const precoMap = new Map<string, number>()

  if (codigos.length) {
    const { data: avs } = await sb
      .from('orcamento_insumos')
      .select('codigo, custo')
      .eq('orcamento_id', orcamentoId)
      .is('composicao_id', null)
      .in('codigo', codigos)
    for (const av of avs ?? []) precoMap.set(av.codigo, av.custo)

    // Composições filhas sem avulso
    const semPreco = codigos.filter(c => !precoMap.has(c))
    if (semPreco.length) {
      const { data: childComps } = await sb
        .from('orcamento_composicoes')
        .select('id, codigo')
        .eq('orcamento_id', orcamentoId)
        .in('codigo', semPreco)
      if (childComps?.length) {
        const childIds = childComps.map((c: any) => c.id)
        const { data: childIns } = await sb
          .from('orcamento_insumos')
          .select('composicao_id, codigo, custo, indice')
          .in('composicao_id', childIds)
        const childCodigos = [...new Set((childIns ?? []).map((i: any) => i.codigo).filter(Boolean))]
        const childAvMap = new Map<string, number>()
        if (childCodigos.length) {
          const { data: avs2 } = await sb
            .from('orcamento_insumos').select('codigo, custo')
            .eq('orcamento_id', orcamentoId).is('composicao_id', null).in('codigo', childCodigos)
          for (const av of avs2 ?? []) childAvMap.set(av.codigo, av.custo)
        }
        for (const comp of childComps as any[]) {
          const seus = (childIns ?? []).filter((i: any) => i.composicao_id === comp.id)
          const custo = seus.reduce((s: number, i: any) => s + (childAvMap.get(i.codigo) ?? i.custo ?? 0) * (i.indice ?? 1), 0)
          precoMap.set(comp.codigo, custo)
        }
      }
    }
  }

  const insumos = insumosBase.map(ins => ({
    ...ins,
    custo: precoMap.has(ins.codigo) ? precoMap.get(ins.codigo)! : ins.custo,
  }))

  const custoTotal = insumos.reduce((s, i) => s + (i.custo ?? 0) * (i.indice ?? 1), 0)

  return (
    <ComposicaoDetail
      composicao={composicao}
      initialInsumos={insumos}
      orcamentoId={orcamentoId}
      custoInicial={custoTotal}
      autoOpenAdd={addItem === '1'}
    />
  )
}
