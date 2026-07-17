-- Elimina o gargalo estrutural de Insumos/Composições/Relatórios em orçamentos
-- com muitas composições: hoje o app busca "insumos vinculados a composições
-- deste orçamento" enviando a lista de IDs de composições na URL
-- (`.in('composicao_id', compIds)`), paginada em lotes de 100 IDs por causa
-- do limite de tamanho de URL do PostgREST — um orçamento com 600 composições
-- vira 6-7 requisições HTTP só para essa busca, em cada tela que precisa dela
-- (Insumos, Composições, Caderno/Relatórios).
--
-- Essa view move o filtro "composicao_id pertence a uma composição deste
-- orçamento" para dentro do banco (JOIN), permitindo filtrar por
-- orcamento_id diretamente — sem precisar enviar a lista de IDs pela URL.
-- Resultado: a mesma busca vira 1 requisição em vez de N/100.
--
-- Por que não usar orcamento_id da própria linha de orcamento_insumos direto
-- (sem view/JOIN)? Porque há casos legados onde esse campo ficou inconsistente
-- (ver auto-correção em src/lib/orcamento/insumos.ts) — o orcamento_id da
-- COMPOSIÇÃO (via JOIN) é a fonte confiável, nunca falha.
--
-- RLS: view sem SECURITY DEFINER herda as políticas das tabelas de origem
-- (orcamento_insumos, orcamento_composicoes) — mesmo padrão já usado em
-- vw_custo_composicao/vw_total_orcamento (initial_schema.sql).

-- Expõe TODAS as colunas de orcamento_insumos (não só as usadas no cálculo
-- de custo) porque src/lib/orcamento/insumos.ts também reaproveita esta view
-- para montar OrcamentoInsumo completo (tipo usado pela tabela de Insumos).
--
-- orcamento_id_raw: o valor cru gravado na linha do insumo (pode estar
-- desatualizado nos casos legados) — exposto à parte de `orcamento_id`
-- (sempre correto, vindo da composição) para que a auto-correção em
-- insumos.ts continue detectando e corrigindo divergências sem precisar de
-- uma consulta extra.
CREATE OR REPLACE VIEW vw_insumos_de_composicao AS
SELECT
  oi.id,
  oc.orcamento_id,
  oi.orcamento_id AS orcamento_id_raw,
  oi.composicao_id,
  oi.codigo,
  oi.descricao,
  oi.unidade,
  oi.custo,
  oi.indice,
  oi.grupo,
  oi.base,
  oi.data_ref,
  oi.custo_atualizado_em,
  oi.codigo_original,
  oi.created_at,
  oi.deleted_at,
  oi.deleted_by
FROM orcamento_insumos oi
JOIN orcamento_composicoes oc ON oc.id = oi.composicao_id;

GRANT SELECT ON vw_insumos_de_composicao TO authenticated;
