-- Categorias de agrupamento definidas pelo usuário para a tabela "(A)
-- DETALHAMENTO DOS CUSTOS" do Resumo Geral do Caderno — cada categoria tem
-- nome livre e a lista de grupos de nível 1 (por `numero`) que pertencem a
-- ela; a ORDEM do array é a ordem de exibição no Caderno. Grupo de nível 1
-- não referenciado em nenhuma categoria continua aparecendo como linha
-- solta (comportamento atual) — diferente de categorias_grafico (lista
-- FIXA, usada só no gráfico de rosca "Distribuição dos Custos").
-- Shape: [{ "id": "<uuid>", "nome": "PROJETOS E SERVIÇOS TÉCNICOS", "numeros": ["01","02"] }, ...]
ALTER TABLE tabela_orcamentos
  ADD COLUMN IF NOT EXISTS categorias_resumo JSONB NOT NULL DEFAULT '[]'::jsonb;

NOTIFY pgrst, 'reload schema';
