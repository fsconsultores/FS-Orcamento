-- =====================================================================
-- Migration: INSERT policies para biblioteca + campos grupo/observacao
-- =====================================================================

ALTER TABLE tabela_insumos ADD COLUMN IF NOT EXISTS grupo      TEXT;
ALTER TABLE tabela_insumos ADD COLUMN IF NOT EXISTS observacao TEXT;

-- INSERT para tabela_insumos (qualquer usuário autenticado do domínio)
CREATE POLICY tabela_insumos_insert ON tabela_insumos
    FOR INSERT TO authenticated
    WITH CHECK (public.is_authorized_domain());

-- INSERT para tabela_composicoes
CREATE POLICY tabela_composicoes_insert ON tabela_composicoes
    FOR INSERT TO authenticated
    WITH CHECK (public.is_authorized_domain());

-- INSERT para tabela_itens_composicao
CREATE POLICY tabela_itens_composicao_insert ON tabela_itens_composicao
    FOR INSERT TO authenticated
    WITH CHECK (public.is_authorized_domain());
