-- =====================================================================
-- Composições incompletas (sem nenhum insumo vinculado) expostas como
-- coluna na própria view — mesmo padrão de is_favorito
-- (20260720000000_favoritos.sql): reaproveita o LEFT JOIN de
-- tabela_itens_composicao que a view já faz, sem query extra.
-- Alimenta o filtro `?incompletas=1` de /composicoes, usado pelo alerta
-- "composições incompletas" da dashboard (antes o alerta linkava pra lista
-- inteira sem nenhum jeito de ver quais eram as incompletas).
-- Mesma regra já documentada nesta view: coluna nova SEMPRE no final,
-- nunca reordenar/renomear as existentes (CREATE OR REPLACE VIEW não
-- permite mudar o tipo de uma coluna existente).
-- =====================================================================
CREATE OR REPLACE VIEW vw_custo_composicao AS
SELECT
    c.id,
    c.codigo,
    c.descricao,
    c.unidade,
    ROUND(COALESCE(SUM(ic.indice * i.preco_base), 0), 4) AS custo_unitario,
    c.base_id,
    b.orgao,
    b.tipo_base,
    c.base_origem,
    EXISTS (
        SELECT 1 FROM favoritos f
        WHERE f.entity_type = 'composicao' AND f.entity_id = c.id AND f.user_id = auth.uid()
    ) AS is_favorito,
    COUNT(ic.id) = 0 AS incompleta
FROM tabela_composicoes c
LEFT JOIN tabela_bases b             ON b.id = c.base_id
LEFT JOIN tabela_itens_composicao ic ON ic.composicao_id = c.id
LEFT JOIN tabela_insumos i           ON i.id = ic.insumo_id
GROUP BY c.id, c.codigo, c.descricao, c.unidade, c.base_id, b.orgao, b.tipo_base, c.base_origem;

GRANT SELECT ON vw_custo_composicao TO authenticated;

NOTIFY pgrst, 'reload schema';
