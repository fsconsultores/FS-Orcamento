-- Soft delete para composições e insumos.
-- Usado pelo "Calcular e Limpar Projeto" para remover órfãos sem destruição física.

ALTER TABLE orcamento_composicoes
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

ALTER TABLE orcamento_insumos
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id);

NOTIFY pgrst, 'reload schema';
