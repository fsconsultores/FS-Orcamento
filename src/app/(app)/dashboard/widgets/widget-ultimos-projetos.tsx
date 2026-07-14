import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { WidgetCard, WidgetEmpty } from './widget-card'
import { IconClock } from './icons'
import { formatRelative } from './format-relative'

type Row = { id: string; nome_obra: string; codigo: string | null; ultimo_acesso: string | null }

export async function WidgetUltimosProjetos() {
  let rows: Row[] = []
  try {
    const sb = (await createClient()) as any
    const { data } = await sb
      .from('tabela_orcamentos')
      .select('id, nome_obra, codigo, ultimo_acesso')
      .order('ultimo_acesso', { ascending: false, nullsFirst: false })
      .limit(5)
    rows = data ?? []
  } catch {
    // mantém vazio
  }

  return (
    <WidgetCard title="Últimos projetos" href="/orcamentos" icon={<IconClock />}>
      {rows.length === 0 ? (
        <WidgetEmpty mensagem="Nenhum orçamento ainda." />
      ) : (
        <ul className="space-y-2.5">
          {rows.map(r => (
            <li key={r.id}>
              <Link
                href={`/orcamentos/${r.id}` as any}
                className="flex items-center justify-between gap-2 text-sm text-gray-700 hover:text-primary-700"
              >
                <span className="truncate">{r.nome_obra}</span>
                <span className="ml-2 flex shrink-0 items-center gap-2">
                  {r.codigo && <span className="font-mono text-xs text-gray-400">{r.codigo}</span>}
                  {r.ultimo_acesso && (
                    <span className="text-xs text-gray-400" title={new Date(r.ultimo_acesso).toLocaleString('pt-BR')}>
                      {formatRelative(r.ultimo_acesso)}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}
