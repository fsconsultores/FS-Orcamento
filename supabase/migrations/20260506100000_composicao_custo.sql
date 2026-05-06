-- Vincula insumos próprios do orçamento a composições próprias do mesmo orçamento.
-- composicao_id é nullable: insumos avulsos (sem composição pai) ficam com NULL.
ALTER TABLE orcamento_insumos
  ADD COLUMN IF NOT EXISTS composicao_id UUID REFERENCES orcamento_composicoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orcamento_insumos_composicao_id
  ON orcamento_insumos(composicao_id)
  WHERE composicao_id IS NOT NULL;
