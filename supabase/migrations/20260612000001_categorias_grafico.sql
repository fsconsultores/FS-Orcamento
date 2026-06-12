-- Mapeamento de cada grupo de nível 1 do orçamento para uma das categorias
-- fixas do gráfico "Distribuição dos Custos (A)" do Caderno de Orçamento
-- (ex: {"02": "CONSULTORIAS", "17": "CONTENÇÃO E FUNDAÇÃO"}). Grupos sem
-- entrada usam uma sugestão automática por palavras-chave, com fallback para
-- "Outros".
ALTER TABLE tabela_orcamentos
  ADD COLUMN IF NOT EXISTS categorias_grafico JSONB NOT NULL DEFAULT '{}'::jsonb;
