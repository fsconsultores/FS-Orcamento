-- Local da obra (cidade/UF), exibido no Caderno de Orçamento (seção 3.0 - Custo/m²)
ALTER TABLE tabela_orcamentos
  ADD COLUMN IF NOT EXISTS local TEXT;
