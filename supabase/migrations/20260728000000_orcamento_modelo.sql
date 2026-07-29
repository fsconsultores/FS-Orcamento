-- Permite marcar um orçamento como "modelo próprio" — reaproveitável na
-- criação de novos orçamentos (planilhas, estrutura, composições e insumos
-- clonados via o mesmo pipeline de duplicarOrcamento).
--
-- Não precisa de RLS nova: a policy tabela_orcamentos_domain (FOR ALL,
-- 20260724000000_orcamentos_visiveis_dominio.sql) já libera qualquer usuário
-- do domínio a ver/editar qualquer orçamento — um modelo marcado por
-- qualquer pessoa já fica utilizável por toda a empresa.
ALTER TABLE tabela_orcamentos
  ADD COLUMN IF NOT EXISTS is_modelo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tabela_orcamentos_is_modelo
  ON tabela_orcamentos(is_modelo) WHERE is_modelo;

NOTIFY pgrst, 'reload schema';
