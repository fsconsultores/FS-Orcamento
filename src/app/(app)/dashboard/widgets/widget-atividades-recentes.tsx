import { createClient } from '@/lib/supabase/server'
import { WidgetCard, WidgetEmpty } from './widget-card'
import { ACAO_LABELS } from '@/lib/historico-labels'

type Row = { id: string; acao: string; mensagem: string; created_at: string }

export async function WidgetAtividadesRecentes() {
  let rows: Row[] = []
  try {
    const sb = (await createClient()) as any
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      const { data } = await sb
        .from('historico_alteracoes')
        .select('id, acao, mensagem, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(8)
      rows = data ?? []
    }
  } catch {
    // mantém vazio
  }

  return (
    <WidgetCard title="Atividades recentes" href="/logs">
      {rows.length === 0 ? (
        <WidgetEmpty mensagem="Nenhuma atividade registrada ainda." />
      ) : (
        <ul className="space-y-2">
          {rows.map(r => (
            <li key={r.id} className="text-sm">
              <span className="block text-gray-700 truncate">{r.mensagem}</span>
              <span className="block text-xs text-gray-400">
                {ACAO_LABELS[r.acao] ?? r.acao} · {new Date(r.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  )
}
