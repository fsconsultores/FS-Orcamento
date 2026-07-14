import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getBaseInfo } from './action'
import { SINAPIBaseForm } from './sinapi-base-form'
import { PageHeader } from '@/components/ui/toolbar'

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
      <nav aria-label="Navegação" className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link href="/bases" className="transition-colors hover:text-primary-700">Bases de Dados</Link>
        <span className="text-gray-300">/</span>
        <Link href="/bases" className="transition-colors hover:text-primary-700">{base.orgao}</Link>
        <span className="text-gray-300">/</span>
        <span className="font-medium text-gray-900">Importar</span>
      </nav>

      <PageHeader
        title={`Importar para ${base.orgao}`}
        description={<>Os dados serão salvos na base global <strong>{base.orgao}</strong> e poderão ser ativados em qualquer orçamento.</>}
      />

      <SINAPIBaseForm baseId={base.id} baseNome={base.orgao} />
    </div>
  )
}
