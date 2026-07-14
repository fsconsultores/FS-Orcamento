import { createClient } from '@/lib/supabase/server'
import { LogsList, type LogRow } from './logs-list'
import { PageHeader } from '@/components/ui/toolbar'

export default async function LogsPage() {
  const sb = (await createClient()) as any
  const { data, error } = await sb
    .from('historico_alteracoes')
    .select('id, created_at, usuario_email, tipo, acao, mensagem, detalhes')
    .order('created_at', { ascending: false })
    .limit(200)

  const logs = (data ?? []) as LogRow[]

  return (
    <div className="space-y-5">
      <PageHeader
        title="Logs do Sistema"
        description="Registro de ações realizadas no sistema — últimos 200 eventos."
      />
      <LogsList initialLogs={logs} fetchError={error?.message} />
    </div>
  )
}
