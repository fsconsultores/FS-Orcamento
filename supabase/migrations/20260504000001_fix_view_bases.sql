-- =====================================================================
-- Fix: parte restante da migration 20260504000000_bases
-- Execute este script no Supabase Dashboard > SQL Editor
-- (as etapas 1–5 já foram aplicadas com sucesso)
-- =====================================================================

-- 6. View vw_custo_composicao com colunas de base
--    custo_unitario permanece na posição 5 (igual ao original) para
--    evitar o erro "cannot change name of view column".
CREATE OR REPLACE VIEW vw_custo_composicao AS
SELECT
    c.id,
    c.codigo,
    c.descricao,
    c.unidade,
    COALESCE(SUM(ic.indice * i.preco_base), 0)::NUMERIC(14,4) AS custo_unitario,
    c.base_id,
    b.orgao,
    b.tipo_base
FROM tabela_composicoes c
LEFT JOIN tabela_bases b              ON b.id = c.base_id
LEFT JOIN tabela_itens_composicao ic  ON ic.composicao_id = c.id
LEFT JOIN tabela_insumos i            ON i.id = ic.insumo_id
GROUP BY c.id, c.codigo, c.descricao, c.unidade, c.base_id, b.orgao, b.tipo_base;

GRANT SELECT ON vw_custo_composicao TO authenticated;

-- 7. Função para obter ou criar a base própria do usuário autenticado
CREATE OR REPLACE FUNCTION get_or_create_propria_base()
RETURNS UUID AS $$
DECLARE
    v_base_id UUID;
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado';
    END IF;

    -- Tenta inserir; ignora se já existir (race condition segura)
    INSERT INTO tabela_bases (nome, orgao, tipo_base, user_id)
    VALUES ('Minha Base', 'PROPRIO', 'propria', v_user_id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_base_id;

    -- Se já existia, busca o id
    IF v_base_id IS NULL THEN
        SELECT id INTO v_base_id
        FROM tabela_bases
        WHERE tipo_base = 'propria' AND user_id = v_user_id;
    END IF;

    RETURN v_base_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION get_or_create_propria_base() TO authenticated;
