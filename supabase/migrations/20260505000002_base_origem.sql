-- Adiciona base_origem para rastrear a procedência dos dados importados.
-- Valores: SINAPI | DNIT | SUDECAP | DER | PROPRIA
-- Independente de base_id (propriedade) — campo puramente informacional.

ALTER TABLE tabela_insumos     ADD COLUMN IF NOT EXISTS base_origem TEXT;
ALTER TABLE tabela_composicoes ADD COLUMN IF NOT EXISTS base_origem TEXT;

CREATE INDEX IF NOT EXISTS tabela_insumos_base_origem_idx
    ON tabela_insumos(base_origem) WHERE base_origem IS NOT NULL;

CREATE INDEX IF NOT EXISTS tabela_composicoes_base_origem_idx
    ON tabela_composicoes(base_origem) WHERE base_origem IS NOT NULL;

-- Recria a view incluindo base_origem de tabela_composicoes
CREATE OR REPLACE VIEW vw_custo_composicao AS
SELECT
    c.id,
    c.codigo,
    c.descricao,
    c.unidade,
    COALESCE(SUM(ic.indice * i.preco_base), 0)::NUMERIC(14,4) AS custo_unitario,
    c.base_id,
    b.orgao,
    b.tipo_base,
    c.base_origem
FROM tabela_composicoes c
LEFT JOIN tabela_bases b             ON b.id = c.base_id
LEFT JOIN tabela_itens_composicao ic ON ic.composicao_id = c.id
LEFT JOIN tabela_insumos i           ON i.id = ic.insumo_id
GROUP BY c.id, c.codigo, c.descricao, c.unidade, c.base_id, b.orgao, b.tipo_base, c.base_origem;

GRANT SELECT ON vw_custo_composicao TO authenticated;
