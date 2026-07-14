import { ImportForm } from './import-form'
import { listBases } from './import-action'
import { PageHeader } from '@/components/ui/toolbar'

export default async function ImportarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const bases = await listBases()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importar"
        description={<>Importe composições e insumos a partir de uma base global ou de um arquivo <strong>.xlsx</strong>.</>}
      />

      <ImportForm orcamentoId={orcamentoId} bases={bases} />
    </div>
  )
}
