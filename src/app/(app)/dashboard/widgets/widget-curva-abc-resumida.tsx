import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { computeAbcCurvaUnica, fmt, type EstruturaItemBasico, type InsumoComposicaoBasico, type InsumoAvulsoBasico } from '@/lib/curva-abc'
import { WidgetCard, WidgetEmpty } from './widget-card'

export async function WidgetCurvaAbcResumida() {
  let orcamentoId: string | null = null
  let nomeObra = ''
  let top: { codigo: string | null; descricao: string; valor_total: number }[] = []

  try {
    const sb = (await createClient()) as any
    const { data: orc } = await sb
      .from('tabela_orcamentos')
      .select('id, nome_obra')
      .order('ultimo_acesso', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()

    if (orc) {
      orcamentoId = orc.id
      nomeObra = orc.nome_obra

      const [{ data: estrutura }, { data: composicoes }] = await Promise.all([
        sb.from('orcamento_estrutura').select('codigo, descricao, unidade, quantidade, custo_unitario').eq('orcamento_id', orc.id).eq('tipo', 'item'),
        sb.from('orcamento_composicoes').select('id, codigo, descricao').eq('orcamento_id', orc.id),
      ])
      const estItems: EstruturaItemBasico[] = estrutura ?? []

      const allInsumos: InsumoComposicaoBasico[] = []
      {
        const { data } = await sb.from('orcamento_insumos').select('codigo, descricao, unidade, custo, indice, composicao_id, grupo')
          .eq('orcamento_id', orc.id).not('composicao_id', 'is', null).range(0, 999)
        allInsumos.push(...(data ?? []))
      }
      const insumosAvulsos: InsumoAvulsoBasico[] = []
      {
        const { data } = await sb.from('orcamento_insumos').select('codigo, descricao, custo, grupo')
          .eq('orcamento_id', orc.id).is('composicao_id', null).range(0, 999)
        insumosAvulsos.push(...(data ?? []))
      }

      const items = computeAbcCurvaUnica(estItems, composicoes ?? [], allInsumos, insumosAvulsos)
      top = items.filter(i => i.classe === 'A').slice(0, 5)
    }
  } catch {
    // mantém vazio
  }

  return (
    <WidgetCard title="Curva ABC resumida" href={orcamentoId ? `/orcamentos/${orcamentoId}/curva-abc` : undefined}>
      {!orcamentoId || top.length === 0 ? (
        <WidgetEmpty mensagem="Sem dados de Curva ABC ainda." />
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-2 truncate">Top Classe A — {nomeObra}</p>
          <ul className="space-y-1">
            {top.map((i, idx) => (
              <li key={idx} className="flex items-center justify-between text-sm gap-2">
                <span className="truncate text-gray-700">{i.descricao}</span>
                <span className="shrink-0 tabular-nums text-gray-500">{fmt(i.valor_total)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </WidgetCard>
  )
}
