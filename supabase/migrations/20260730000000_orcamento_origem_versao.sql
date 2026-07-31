-- Rastreia de qual orçamento/versão um orçamento novo foi criado, quando
-- criado via "Criar novo orçamento desta versão" (tela Versões). Mesmo
-- padrão de referência de linhagem já usado em orcamento_versoes.restaurado_de,
-- mas com ON DELETE SET NULL (diferente de orcamento_versoes, orçamentos
-- PODEM ser excluídos — apagar a origem não deve travar nem cascatear a
-- exclusão do orçamento derivado, só perde o rastro).

ALTER TABLE tabela_orcamentos
  ADD COLUMN IF NOT EXISTS origem_orcamento_id UUID REFERENCES tabela_orcamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem_versao_id UUID REFERENCES orcamento_versoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tabela_orcamentos_origem
  ON tabela_orcamentos(origem_orcamento_id) WHERE origem_orcamento_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
