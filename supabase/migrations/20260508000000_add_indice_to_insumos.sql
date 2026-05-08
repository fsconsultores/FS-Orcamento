-- Adiciona coluna indice em orcamento_insumos.
-- Usada no cálculo do custo unitário da composição: Σ(custo × indice).
ALTER TABLE orcamento_insumos
  ADD COLUMN IF NOT EXISTS indice numeric(14,6) NOT NULL DEFAULT 1;
