interface Props {
  estimado: boolean
  estimadoMotivo?: string | null
  className?: string
}

/**
 * Indicador somente-leitura de "preço estimado" — nunca editável por aqui.
 * O valor vem sempre da cotação ativa do insumo (orcamento_insumo_cotacoes),
 * registrada no modal de cotação da aba Insumos; nunca de uma marcação
 * manual no item/composição. Reutilizado no detalhe da Composição e na
 * Planilha (modo Analítica) pra mostrar a mesma informação sem criar uma
 * segunda fonte de verdade em cada tela.
 */
export function EstimadoBadge({ estimado, estimadoMotivo, className }: Props) {
  if (!estimado) return <span className={`text-gray-300 ${className ?? ''}`}>—</span>
  return (
    <span
      title={estimadoMotivo ? `Preço estimado — ${estimadoMotivo}` : 'Preço estimado'}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 whitespace-nowrap ${className ?? ''}`}
    >
      Estimado
    </span>
  )
}
