-- =====================================================================
-- FIX: vw_total_orcamento — BDI deve ser dividido por 100
-- O campo bdi_global/bdi_especifico é armazenado em % (ex: 25 = 25%)
-- A view anterior calculava (1 + 25) = 26x em vez de (1 + 0.25) = 1.25x
-- Aplique no Supabase Dashboard > SQL Editor
-- =====================================================================

CREATE OR REPLACE VIEW vw_total_orcamento AS
SELECT
    o.id            AS orcamento_id,
    o.user_id,
    o.nome_obra,
    COALESCE(
        SUM(io.quantidade * vc.custo_unitario),
        0
    )::NUMERIC(14,4) AS total_sem_bdi,
    COALESCE(
        SUM(
            io.quantidade
            * vc.custo_unitario
            * (1 + COALESCE(io.bdi_especifico, o.bdi_global) / 100.0)
        ),
        0
    )::NUMERIC(14,4) AS total_com_bdi
FROM tabela_orcamentos o
LEFT JOIN tabela_itens_orcamento io ON io.orcamento_id = o.id
LEFT JOIN vw_custo_composicao    vc ON vc.id = io.composicao_id
GROUP BY o.id, o.user_id, o.nome_obra;

-- Re-aplica o grant (CREATE OR REPLACE derruba permissões em algumas versões)
GRANT SELECT ON vw_total_orcamento TO authenticated;
