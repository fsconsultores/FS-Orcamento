ALTER TABLE tabela_orcamentos
  ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMPTZ;
