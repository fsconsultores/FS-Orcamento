-- Corrige overflow numérico em views e função que fazem ::NUMERIC(14,4)
-- sobre produtos de indice × preco_base. Com dados DNIT/SICRO, esses produtos
-- podem exceder o limite do cast (max 9.999.999.999,9999), gerando erro 22003.
-- A correção substitui o cast por ROUND(..., 4) que não tem limite de magnitude.

-- 1. Função de custo de composição
CREATE OR REPLACE FUNCTION calcular_custo_composicao(p_composicao_id UUID)
RETURNS NUMERIC AS $$
    SELECT ROUND(COALESCE(SUM(ic.indice * i.preco_base), 0), 4)
    FROM tabela_itens_composicao ic
    JOIN tabela_insumos i ON i.id = ic.insumo_id
    WHERE ic.composicao_id = p_composicao_id;
$$ LANGUAGE sql STABLE;

-- 2. View de custo de composição (DROP necessário: não é possível alterar tipo de coluna com CREATE OR REPLACE)
DROP VIEW IF EXISTS vw_total_orcamento;
DROP VIEW IF EXISTS vw_custo_composicao;

CREATE VIEW vw_custo_composicao AS
SELECT
    c.id,
    c.codigo,
    c.descricao,
    c.unidade,
    ROUND(COALESCE(SUM(ic.indice * i.preco_base), 0), 4) AS custo_unitario,
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

-- 3. View de total do orçamento (mantém correção do BDI ÷ 100)
CREATE OR REPLACE VIEW vw_total_orcamento AS
SELECT
    o.id AS orcamento_id,
    o.user_id,
    o.nome_obra,
    ROUND(COALESCE(SUM(io.quantidade * vc.custo_unitario), 0), 4) AS total_sem_bdi,
    ROUND(COALESCE(
        SUM(
            io.quantidade
            * vc.custo_unitario
            * (1 + COALESCE(io.bdi_especifico, o.bdi_global) / 100.0)
        ),
        0
    ), 4) AS total_com_bdi
FROM tabela_orcamentos o
LEFT JOIN tabela_itens_orcamento io ON io.orcamento_id = o.id
LEFT JOIN vw_custo_composicao    vc ON vc.id = io.composicao_id
GROUP BY o.id, o.user_id, o.nome_obra;

GRANT SELECT ON vw_total_orcamento TO authenticated;
