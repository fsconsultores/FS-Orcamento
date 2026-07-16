-- ============================================================================
-- EXPLAIN ANALYZE das queries mais quentes do sistema (Fase 2/3 de performance)
-- ============================================================================
-- Não tenho acesso direto ao Postgres deste projeto (sem DATABASE_URL, sem
-- Docker local rodando) — rode isto manualmente no SQL Editor do Supabase e
-- cole os planos de volta se quiser que eu interprete os resultados.
--
-- Troque os UUIDs de exemplo (marcados com <<...>>) por um orcamento_id e
-- planilha_id reais do seu banco antes de rodar. Para pegar um bom candidato
-- (orçamento grande, mede o pior caso real):
--
--   SELECT orcamento_id, count(*) FROM orcamento_estrutura
--   GROUP BY orcamento_id ORDER BY count(*) DESC LIMIT 5;
--
-- O que procurar no plano:
--   Seq Scan       → tabela inteira lida linha a linha. Ok em tabelas
--                     pequenas; ruim (>alguns milhares de linhas) sem filtro
--                     seletivo — sinal de índice ausente ou não usado.
--   Bitmap Scan    → usa índice para achar as páginas relevantes e depois lê
--                     em lote. Normal e bom para filtros que batem várias
--                     linhas espalhadas.
--   Index Scan     → o ideal para buscas pontuais/ordenadas — usa o índice
--                     diretamente, sem varrer a tabela.
--   Sort           → ordenação explícita (nó "Sort") custa memória/CPU
--                     proporcional ao nº de linhas. Se aparece logo após um
--                     Seq/Bitmap Scan num ORDER BY que já tem índice
--                     composto cobrindo a ordem, o índice não está sendo
--                     aproveitado — merece investigar.
--   Hash Join      → normal para joins grandes sem filtro seletivo de um
--                     lado. Se o "Hash" carrega muitas linhas que depois são
--                     quase todas descartadas, o filtro devia rodar antes.
--
-- Depois de rodar, se algum destes ainda aparecer como Seq Scan puro (sem
-- bitmap/index) numa tabela com muitas linhas, é sinal de que os índices da
-- migration 20260716000000_indices_performance.sql não foram aplicados
-- ainda, ou que o planner decidiu não usá-los (rode ANALYZE nas tabelas após
-- aplicar os índices — estatísticas desatualizadas fazem o planner ignorar
-- um índice bom).

-- 1. Query mais quente do sistema: abertura da Planilha
--    (orcamento_estrutura filtrado por planilha_id, ordenado por nivel+ordem)
--    Índice esperado: idx_orcamento_estrutura_planilha_nivel_ordem
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, parent_id, planilha_id, numero, nivel, codigo, descricao, unidade,
       quantidade, custo_unitario, bdi_especifico, tipo, ordem
FROM orcamento_estrutura
WHERE orcamento_id = '<<orcamento_id>>'
  AND planilha_id = '<<planilha_id>>'
ORDER BY nivel ASC, ordem ASC;

-- 2. Motor de cálculo: preço de insumos por código (roda a cada recálculo)
--    Índice esperado: idx_orcamento_insumos_orcamento_codigo
EXPLAIN (ANALYZE, BUFFERS)
SELECT codigo, custo
FROM orcamento_insumos
WHERE orcamento_id = '<<orcamento_id>>'
  AND composicao_id IS NULL;

-- 3. Motor de cálculo: sub-composições por código
--    Índice esperado: idx_orcamento_composicoes_orcamento_codigo
EXPLAIN (ANALYZE, BUFFERS)
SELECT codigo, custo_unitario
FROM orcamento_composicoes
WHERE orcamento_id = '<<orcamento_id>>'
  AND codigo = ANY(ARRAY['<<codigo1>>', '<<codigo2>>'])
  AND deleted_at IS NULL;

-- 4. Códigos utilizados na planilha (Insumos/Composições/Curva ABC)
--    Índice esperado: idx_orcamento_estrutura_orcamento_tipo
EXPLAIN (ANALYZE, BUFFERS)
SELECT codigo
FROM orcamento_estrutura
WHERE orcamento_id = '<<orcamento_id>>'
  AND tipo = 'item';

-- 5. Lista de planilhas do orçamento — roda em toda troca de aba
--    Índice esperado: idx_orcamento_planilhas_orcamento_ordem
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM orcamento_planilhas
WHERE orcamento_id = '<<orcamento_id>>'
ORDER BY ordem;

-- 6. Insumos vinculados a composições (Insumos/Composições page, export)
EXPLAIN (ANALYZE, BUFFERS)
SELECT composicao_id, codigo, descricao, unidade, custo, indice, grupo
FROM orcamento_insumos
WHERE composicao_id = ANY(ARRAY['<<comp_id1>>'::uuid, '<<comp_id2>>'::uuid]);

-- 7. Histórico de alterações do orçamento (tela de Logs)
--    Já tem índice composto (orcamento_id, created_at DESC) desde a criação
--    da tabela — deve sair Index Scan direto.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, planilha_id, usuario_email, acao, entidade, mensagem, created_at
FROM historico_alteracoes
WHERE orcamento_id = '<<orcamento_id>>'
ORDER BY created_at DESC
LIMIT 200;

-- 8. Bibliotecas globais (Insumos/Composições fora de um orçamento — bases
--    como SINAPI). Já tem índices únicos (codigo, base_id) desde a migration
--    de bases; verificar se o planner usa Index Scan em buscas por texto.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, codigo, descricao, unidade, preco_base
FROM tabela_insumos
WHERE codigo ILIKE '%<<termo>>%' OR descricao ILIKE '%<<termo>>%'
ORDER BY codigo
LIMIT 100;
-- Atenção: ILIKE '%...%' (sem prefixo fixo) NUNCA usa índice B-tree comum,
-- só um índice trigram (pg_trgm) ou full-text search resolveria isso via
-- índice. Se esta query aparecer lenta no dashboard /dev/performance com
-- bases grandes (SINAPI), é candidata a um índice GIN com pg_trgm — não
-- criei esse índice agora porque é uma mudança de infra (extensão
-- pg_trgm) fora do escopo de "índices simples faltando", mas é a próxima
-- otimização de banco natural se a busca por texto aparecer lenta.
