-- Permite remover um registro específico do histórico de preço de insumo por
-- orçamento (ex.: alteração feita sem querer) sem perder o rastro — mesmo
-- padrão de soft delete já usado em orcamento_composicoes/orcamento_insumos
-- (20260702000001_soft_delete.sql): a linha some da listagem/gráfico, mas
-- continua no banco (deleted_at/deleted_by) e a própria remoção é registrada
-- em historico_alteracoes (ver excluirHistoricoPreco em insumos-table.tsx).
ALTER TABLE orcamento_insumo_historico_precos
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

NOTIFY pgrst, 'reload schema';
