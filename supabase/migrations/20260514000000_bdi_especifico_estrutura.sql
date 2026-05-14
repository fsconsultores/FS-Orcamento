ALTER TABLE orcamento_estrutura
  ADD COLUMN IF NOT EXISTS bdi_especifico NUMERIC(7,4) CHECK (bdi_especifico >= 0);
