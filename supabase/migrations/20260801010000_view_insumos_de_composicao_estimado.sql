-- vw_insumos_de_composicao lista colunas explicitamente (não SELECT *), então
-- as colunas estimado/estimado_motivo adicionadas em orcamento_insumos
-- (20260801000000_insumo_estimado.sql) não aparecem nela sem esta atualização.
-- Necessário para o Caderno (getCadernoData) e a aba Insumos, que dependem
-- desta view para saber quais insumos embutidos em composição estão
-- marcados como estimado.
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
  oi.deleted_by,
  oi.estimado,
  oi.estimado_motivo
FROM orcamento_insumos oi
JOIN orcamento_composicoes oc ON oc.id = oi.composicao_id;

GRANT SELECT ON vw_insumos_de_composicao TO authenticated;

NOTIFY pgrst, 'reload schema';
