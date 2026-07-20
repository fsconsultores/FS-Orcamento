-- Views de suporte à Dashboard reformulada. Objetivo: substituir os N
-- round-trips de contagem que hoje rodam em bases/page.tsx (2 count() por
-- base, em loop) e resolver "última importação por base" (não existe hoje
-- como coluna) por 1 única consulta agregada no banco.
--
-- RLS: sem SECURITY DEFINER, herdam as políticas das tabelas de origem —
-- mesmo padrão de vw_custo_composicao/vw_insumos_de_composicao. Como
-- tabela_insumos/tabela_composicoes têm SELECT liberado a qualquer
-- authenticated (USING (true)) e tabela_bases só restringe a base própria de
-- cada usuário, o resultado dessas views já vem naturalmente filtrado: bases
-- externas (SINAPI/DNIT/SUDECAP/DER) aparecem para todos, a base própria só
-- para o dono. O app ainda separa em cache (bases externas) vs. sem cache
-- (base própria) — ver src/lib/dashboard/queries.ts.

-- CORRIGIDO (2026-07-20): a versão original fazia LEFT JOIN de
-- tabela_insumos E tabela_composicoes na MESMA query, um fan-out clássico —
-- para uma base com I insumos e C composições, o join produz I×C linhas
-- intermediárias ANTES do GROUP BY colapsar (COUNT DISTINCT não evita o
-- produto cartesiano, só corrige a contagem final). Com bases reais na casa
-- de milhares de insumos e milhares de composições, isso gerava dezenas de
-- milhões de linhas temporárias e a query falhava em produção com "could not
-- write to file ... No space left on device" (Postgres, erro 53100) — a view
-- nunca funcionou de verdade. Corrigido pré-agregando cada tabela em uma
-- subquery própria (1 linha por base_id) ANTES de juntar — join 1:1:1, sem
-- multiplicação nenhuma.
CREATE OR REPLACE VIEW vw_bases_resumo AS
SELECT
  b.id AS base_id,
  b.nome,
  b.orgao,
  b.tipo_base,
  b.user_id,
  COALESCE(ic.total_insumos, 0) AS total_insumos,
  COALESCE(cc.total_composicoes, 0) AS total_composicoes,
  GREATEST(ic.ultima_insumo, cc.ultima_composicao) AS ultima_importacao
FROM tabela_bases b
LEFT JOIN (
  SELECT
    base_id,
    COUNT(*) AS total_insumos,
    GREATEST(MAX(data_referencia)::timestamptz, MAX(created_at)) AS ultima_insumo
  FROM tabela_insumos
  GROUP BY base_id
) ic ON ic.base_id = b.id
LEFT JOIN (
  SELECT base_id, COUNT(*) AS total_composicoes, MAX(created_at) AS ultima_composicao
  FROM tabela_composicoes
  GROUP BY base_id
) cc ON cc.base_id = b.id;

GRANT SELECT ON vw_bases_resumo TO authenticated;

-- Resumo do sistema: totais globais da biblioteca (insumos/composições) já
-- quebrados por categoria (materiais/mão de obra/equipamentos/serviços),
-- espelhando exatamente a regra de classificarCategoriaAbc() em
-- src/lib/curva-abc.ts (grupo 'E' = equipamentos, 'H'/'HH'/prefixo 'MO' =
-- mão de obra, 'S'/prefixo 'SER' = serviços, resto = materiais). Calculado
-- em SQL (não trazendo linhas para o Node) porque bases como SINAPI têm
-- dezenas de milhares de insumos — ver auditoria de performance anterior.
--
-- total_insumos_sem_preco / total_composicoes_incompletas alimentam os
-- alertas "itens sem preço"/"composições incompletas" da dashboard sem que
-- alertas.ts precise rodar nenhuma query própria (composicao_id tem índice
-- — tabela_itens_composicao_composicao_idx — então o NOT EXISTS é barato).
CREATE OR REPLACE VIEW vw_resumo_sistema AS
SELECT
  (SELECT COUNT(*) FROM tabela_insumos) AS total_insumos_globais,
  (SELECT COUNT(*) FROM tabela_composicoes) AS total_composicoes_globais,
  (SELECT COUNT(*) FROM tabela_insumos
     WHERE UPPER(TRIM(COALESCE(grupo, ''))) = 'E') AS total_equipamentos,
  (SELECT COUNT(*) FROM tabela_insumos
     WHERE UPPER(TRIM(COALESCE(grupo, ''))) IN ('H', 'HH')
        OR UPPER(TRIM(COALESCE(grupo, ''))) LIKE 'MO%') AS total_mao_de_obra,
  (SELECT COUNT(*) FROM tabela_insumos
     WHERE UPPER(TRIM(COALESCE(grupo, ''))) = 'S'
        OR UPPER(TRIM(COALESCE(grupo, ''))) LIKE 'SER%') AS total_servicos,
  (SELECT COUNT(*) FROM tabela_insumos
     WHERE UPPER(TRIM(COALESCE(grupo, ''))) NOT IN ('E', 'H', 'HH', 'S')
       AND UPPER(TRIM(COALESCE(grupo, ''))) NOT LIKE 'MO%'
       AND UPPER(TRIM(COALESCE(grupo, ''))) NOT LIKE 'SER%') AS total_materiais,
  (SELECT COUNT(*) FROM tabela_insumos
     WHERE preco_base IS NULL OR preco_base = 0) AS total_insumos_sem_preco,
  (SELECT COUNT(*) FROM tabela_composicoes c
     WHERE NOT EXISTS (
       SELECT 1 FROM tabela_itens_composicao tic WHERE tic.composicao_id = c.id
     )) AS total_composicoes_incompletas;

GRANT SELECT ON vw_resumo_sistema TO authenticated;
