-- Configuração de numeração hierárquica da planilha (níveis e quantidade de
-- dígitos por nível, ex: [2,2,2,2] => 01.01.01.01). Default {1,1,1,1} preserva
-- o comportamento atual (sem zero-padding).
ALTER TABLE tabela_orcamentos
  ADD COLUMN IF NOT EXISTS numeracao_digitos INTEGER[] NOT NULL DEFAULT '{1,1,1,1}';
