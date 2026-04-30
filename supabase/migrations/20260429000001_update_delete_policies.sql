-- =====================================================================
-- Migration: UPDATE/DELETE policies para tabelas de biblioteca
-- =====================================================================

CREATE POLICY tabela_insumos_update ON tabela_insumos
    FOR UPDATE TO authenticated
    USING (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

CREATE POLICY tabela_insumos_delete ON tabela_insumos
    FOR DELETE TO authenticated
    USING (public.is_authorized_domain());

CREATE POLICY tabela_composicoes_update ON tabela_composicoes
    FOR UPDATE TO authenticated
    USING (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

CREATE POLICY tabela_composicoes_delete ON tabela_composicoes
    FOR DELETE TO authenticated
    USING (public.is_authorized_domain());

CREATE POLICY tabela_itens_composicao_update ON tabela_itens_composicao
    FOR UPDATE TO authenticated
    USING (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

CREATE POLICY tabela_itens_composicao_delete ON tabela_itens_composicao
    FOR DELETE TO authenticated
    USING (public.is_authorized_domain());