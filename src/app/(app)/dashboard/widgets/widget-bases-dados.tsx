import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { WidgetCard, WidgetEmpty } from './widget-card'
import { IconDatabase } from './icons'
import { baseLabelFromOrgao } from '@/components/base-labels'

type Row = { id: string; nome: string; orgao: string; tipo_base: string; total_insumos: number; total_composicoes: number }

export async function WidgetBasesDados() {
  let rows: Row[] = []
  try {
    const sb = (await createClient()) as any
    const { data } = await sb
      .from('tabela_bases')
      .select('id, nome, orgao, tipo_base, total_insumos, total_composicoes')
      .order('total_insumos', { ascending: false })
      .limit(5)
    rows = data ?? []
  } catch {
    // mantém vazio
  }

  return (
    <WidgetCard title="Bases utilizadas" href="/bases" icon={<IconDatabase />}>
      {rows.length === 0 ? (
        <WidgetEmpty mensagem="Nenhuma base cadastrada ainda." />
      ) : (
        <ul className="space-y-2.5">
          {rows.map(r => (
            <li key={r.id}>
              <Link
                href="/bases"
                className="flex items-center justify-between gap-2 text-sm text-gray-700 hover:text-primary-700"
              >
                <span className="truncate">{r.tipo_base === 'propria' ? 'Minha Base' : baseLabelFromOrgao(r.orgao)}</span>
                <span className="ml-2 shrink-0 text-xs text-gray-400 tabular-nums">
                  {(r.total_insumos + r.total_composicoes).toLocaleString('pt-BR')} itens
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}
