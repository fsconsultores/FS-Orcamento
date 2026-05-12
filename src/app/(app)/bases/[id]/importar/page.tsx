import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBaseInfo } from './action'
import { SINAPIBaseForm } from './sinapi-base-form'

export default async function BaseImportarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const base = await getBaseInfo(id)
  if (!base) notFound()

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/bases" className="text-sm text-blue-600 hover:underline">← Bases</Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Importar para {base.orgao}</h1>
        <p className="mt-1 text-sm text-gray-500">
          Os dados serão salvos na base global <strong>{base.orgao}</strong> e poderão ser ativados em qualquer orçamento.
        </p>
      </div>

      <SINAPIBaseForm baseId={base.id} baseNome={base.orgao} />
    </div>
  )
}
