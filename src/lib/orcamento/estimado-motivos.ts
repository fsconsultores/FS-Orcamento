// Motivos pré-definidos para "Item estimado" — puramente para a UI (dropdown
// de seleção rápida). O banco (orcamento_estrutura.estimado_motivo) guarda
// sempre texto livre, sem enum: se um dia essa lista mudar, itens antigos
// continuam válidos, só deixam de bater com uma opção pré-definida e caem no
// modo "Outro" (texto livre) automaticamente.

export const MOTIVOS_ESTIMADO_PRESET = [
  'Preço ainda não definido',
  'Fornecedor sem retorno',
  'Projeto incompleto',
  'Aguardando levantamento',
  'Aguardando composição',
] as const

/** Valor sentinela do <select> quando o usuário escolhe texto livre em vez de uma opção pré-definida. */
export const OUTRO_ESTIMADO_SENTINEL = '__outro__'
