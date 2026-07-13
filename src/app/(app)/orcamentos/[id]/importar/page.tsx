import { ImportForm } from './import-form'
import { listBases } from './import-action'

export default async function ImportarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params
  const bases = await listBases()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar</h1>
        <p className="mt-1 text-sm text-gray-500">
          Importe composições e insumos a partir de uma base global ou de um arquivo <strong>.xlsx</strong>.
        </p>
      </div>

      <ImportForm orcamentoId={orcamentoId} bases={bases} />
    </div>
  )
}
