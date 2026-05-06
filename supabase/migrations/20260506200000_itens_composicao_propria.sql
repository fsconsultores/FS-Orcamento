-- Permite que itens do orçamento referenciem composições da biblioteca compartilhada
-- OU composições próprias do orçamento (importadas/criadas manualmente).

ALTER TABLE tabela_itens_orcamento
  ALTER COLUMN composicao_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS orcamento_composicao_id UUID
    REFERENCES orcamento_composicoes(id) ON DELETE RESTRICT;

-- Exatamente uma das duas FKs deve estar preenchida
ALTER TABLE tabela_itens_orcamento
  ADD CONSTRAINT itens_tem_exatamente_uma_composicao CHECK (
    (composicao_id IS NOT NULL AND orcamento_composicao_id IS NULL) OR
    (composicao_id IS NULL      AND orcamento_composicao_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS tabela_itens_orcamento_orc_comp_idx
  ON tabela_itens_orcamento(orcamento_composicao_id)
  WHERE orcamento_composicao_id IS NOT NULL;
