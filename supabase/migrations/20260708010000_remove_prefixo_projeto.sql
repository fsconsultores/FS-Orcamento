-- Reverte o prefixo de projeto aplicado automaticamente ao codigo em
-- orcamento_insumos/orcamento_composicoes (20260707000000_sufixo_projeto.sql
-- e 20260707000001_prefixo_projeto.sql).
--
-- Problema: o trigger só age em INSERTs novos, então qualquer insumo/
-- composição criado depois dessa migração (ex.: preço avulso novo criado ao
-- editar o preço de um insumo dentro de uma composição, nova composição
-- auxiliar, itens importados) ganhava um codigo prefixado com o código do
-- projeto (ex.: "I0001" -> "ABC-I0001"), enquanto orcamento_estrutura.codigo
-- (nunca prefixado) e os demais insumos/composições já existentes no projeto
-- (inseridos antes da migração) continuavam com o código puro. O motor de
-- cálculo casa tudo por codigo exato — com códigos divergentes, o preço novo
-- deixava de ser encontrado e a planilha parava de recalcular corretamente
-- (inclusive via "Calcular Planilha/Projeto", já que o valor recalculado
-- nunca batia com nenhum item da estrutura).
--
-- O código por projeto vira obsoleto: codigo_original permanece na tabela
-- (útil só como metadado/futuras métricas por projeto) mas deixa de mexer no
-- codigo usado para casamento dentro do projeto.

-- 1. Repara linhas já prefixadas: restaura o código original.
UPDATE orcamento_insumos
  SET codigo = codigo_original
  WHERE codigo_original IS NOT NULL
    AND codigo IS DISTINCT FROM codigo_original;

UPDATE orcamento_composicoes
  SET codigo = codigo_original
  WHERE codigo_original IS NOT NULL
    AND codigo IS DISTINCT FROM codigo_original;

-- 2. Desativa os triggers — novas linhas mantêm o código exatamente como
--    fornecido pela aplicação, sem prefixo automático.
DROP TRIGGER IF EXISTS trg_sufixo_projeto_insumo ON orcamento_insumos;
DROP TRIGGER IF EXISTS trg_sufixo_projeto_composicao ON orcamento_composicoes;
DROP FUNCTION IF EXISTS _trg_sufixo_projeto();

NOTIFY pgrst, 'reload schema';
