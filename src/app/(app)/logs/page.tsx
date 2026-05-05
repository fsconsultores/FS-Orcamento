import { createClient } from '@/lib/supabase/server'
import { LogsList, type LogRow } from './logs-list'

export default async function LogsPage() {
  const sb = (await createClient()) as any
  const { data } = await sb
    .from('tabela_logs')
    .select('id, created_at, empresa, usuario, tipo, acao, mensagem, contexto')
    .order('created_at', { ascending: false })
    .limit(100)

  const logs = (data ?? []) as LogRow[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Logs do Sistema</h1>
        <p className="mt-1 text-sm text-gray-500">
          Registro de ações realizadas no sistema — últimos 100 eventos.
        </p>
      </div>

      <LogsList initialLogs={logs} />
    </div>
  )
}
