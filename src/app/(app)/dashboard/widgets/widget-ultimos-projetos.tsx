import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { WidgetCard, WidgetEmpty } from './widget-card'

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
    <WidgetCard title="Últimos projetos" href="/orcamentos">
      {rows.length === 0 ? (
        <WidgetEmpty mensagem="Nenhum orçamento ainda." />
      ) : (
        <ul className="space-y-1.5">
          {rows.map(r => (
            <li key={r.id}>
              <Link
                href={`/orcamentos/${r.id}` as any}
                className="flex items-center justify-between text-sm text-gray-700 hover:text-blue-600 truncate"
              >
                <span className="truncate">{r.nome_obra}</span>
                {r.codigo && <span className="ml-2 shrink-0 font-mono text-xs text-gray-400">{r.codigo}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}
