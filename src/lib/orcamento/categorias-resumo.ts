/**
 * Categorias de agrupamento definidas pelo usuário para a tabela "(A)
 * DETALHAMENTO DOS CUSTOS" do Resumo Geral do Caderno — ver
 * supabase/migrations/20260915000000_categorias_resumo.sql. Diferente de
 * categorias-grafico.ts (lista fixa, hardcoded): aqui nome e membros são
 * 100% definidos pelo usuário, por isso cada categoria carrega sua própria
 * lista de membros em vez de um Record<numero, labelFixo> — renomear é só
 * editar 1 campo, sem reescrever referência nenhuma.
 */
export interface CategoriaResumoGrupo {
  id: string
  nome: string
  /** orcamento_estrutura.numero dos grupos de nível 1 que pertencem a esta categoria. */
  numeros: string[]
}
