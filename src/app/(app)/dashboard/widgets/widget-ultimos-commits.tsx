import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { WidgetCard, WidgetEmpty } from './widget-card'

type Row = {
  id: string
  orcamento_id: string
  mensagem: string
  autor_email: string | null
  criado_em: string
  tabela_orcamentos: { nome_obra: string } | null
}

export async function WidgetUltimosCommits() {
  let rows: Row[] = []
  try {
    const sb = (await createClient()) as any
    const { data } = await sb
      .from('orcamento_versoes')
      .select('id, orcamento_id, mensagem, autor_email, criado_em, tabela_orcamentos(nome_obra)')
      .order('criado_em', { ascending: false })
      .limit(5)
    rows = data ?? []
  } catch {
    // mantém vazio
  }

  return (
    <WidgetCard title="Últimos commits">
      {rows.length === 0 ? (
        <WidgetEmpty mensagem="Nenhuma versão criada ainda." />
      ) : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.id} className="text-sm">
              <Link href={`/orcamentos/${r.orcamento_id}/versoes` as any} className="text-gray-700 hover:text-blue-600">
                <span className="block truncate">{r.mensagem}</span>
                <span className="block text-xs text-gray-400 truncate">
                  {r.tabela_orcamentos?.nome_obra ?? '—'} · {r.autor_email ?? 'sistema'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}
