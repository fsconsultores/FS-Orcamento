-- =====================================================================
-- FIX: políticas UPDATE/DELETE para biblioteca (insumos, composicoes, itens)
-- Aplique este script no Supabase Dashboard > SQL Editor
-- =====================================================================

-- Remove políticas existentes para evitar conflito (idempotente)
DROP POLICY IF EXISTS tabela_insumos_insert          ON tabela_insumos;
DROP POLICY IF EXISTS tabela_insumos_update          ON tabela_insumos;
DROP POLICY IF EXISTS tabela_insumos_delete          ON tabela_insumos;
DROP POLICY IF EXISTS tabela_composicoes_insert      ON tabela_composicoes;
DROP POLICY IF EXISTS tabela_composicoes_update      ON tabela_composicoes;
DROP POLICY IF EXISTS tabela_composicoes_delete      ON tabela_composicoes;
DROP POLICY IF EXISTS tabela_itens_composicao_insert ON tabela_itens_composicao;
DROP POLICY IF EXISTS tabela_itens_composicao_update ON tabela_itens_composicao;
DROP POLICY IF EXISTS tabela_itens_composicao_delete ON tabela_itens_composicao;

-- Adiciona coluna grupo e observacao se não existirem
ALTER TABLE tabela_insumos ADD COLUMN IF NOT EXISTS grupo      TEXT;
ALTER TABLE tabela_insumos ADD COLUMN IF NOT EXISTS observacao TEXT;

-- tabela_insumos: CRUD para usuários do domínio autenticados
CREATE POLICY tabela_insumos_insert ON tabela_insumos
    FOR INSERT TO authenticated
    WITH CHECK (public.is_authorized_domain());

CREATE POLICY tabela_insumos_update ON tabela_insumos
    FOR UPDATE TO authenticated
    USING     (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

CREATE POLICY tabela_insumos_delete ON tabela_insumos
    FOR DELETE TO authenticated
    USING (public.is_authorized_domain());

-- tabela_composicoes: CRUD para usuários do domínio autenticados
CREATE POLICY tabela_composicoes_insert ON tabela_composicoes
    FOR INSERT TO authenticated
    WITH CHECK (public.is_authorized_domain());

CREATE POLICY tabela_composicoes_update ON tabela_composicoes
    FOR UPDATE TO authenticated
    USING     (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

CREATE POLICY tabela_composicoes_delete ON tabela_composicoes
    FOR DELETE TO authenticated
    USING (public.is_authorized_domain());

-- tabela_itens_composicao: CRUD para usuários do domínio autenticados
CREATE POLICY tabela_itens_composicao_insert ON tabela_itens_composicao
    FOR INSERT TO authenticated
    WITH CHECK (public.is_authorized_domain());

CREATE POLICY tabela_itens_composicao_update ON tabela_itens_composicao
    FOR UPDATE TO authenticated
    USING     (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

CREATE POLICY tabela_itens_composicao_delete ON tabela_itens_composicao
    FOR DELETE TO authenticated
    USING (public.is_authorized_domain());

-- Grants nas views (caso não existam)
GRANT SELECT ON vw_custo_composicao TO authenticated;
GRANT SELECT ON vw_total_orcamento  TO authenticated;

-- Verificação: lista políticas ativas após o script
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('tabela_insumos','tabela_composicoes','tabela_itens_composicao')
ORDER BY tablename, cmd;
