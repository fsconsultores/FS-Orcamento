import { ImportForm } from './import-form'

export default async function ImportarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orcamentoId } = await params

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Importar Excel</h1>
        <p className="mt-1 text-sm text-gray-500">
          Importe composições e insumos a partir de um arquivo <strong>.xlsx</strong>.
        </p>
      </div>

      <ImportForm orcamentoId={orcamentoId} />
    </div>
  )
}
