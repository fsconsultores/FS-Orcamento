import { createClient } from '@/lib/supabase/server'
import { getCadernoData } from '@/lib/orcamento'
import { CadernoView } from './caderno-view'

export default async function CadernoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const supabase = await createClient()
  const data = await getCadernoData(supabase as any, orcamentoId)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Caderno de Orçamento</h1>
        <p className="text-sm text-gray-500 mt-1">
          Exporte o caderno completo em PDF, no modelo padrão de relatório.
        </p>
      </div>
      <CadernoView data={data} />
    </div>
  )
}
