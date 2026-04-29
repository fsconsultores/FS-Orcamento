-- =====================================================================
-- Migration: restrição de domínio @fsconsultores.com.br
-- =====================================================================

CREATE OR REPLACE FUNCTION public.enforce_email_domain()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.email IS NULL
       OR LOWER(NEW.email) !~ '^[^@]+@fsconsultores\.com\.br$'
    THEN
        RAISE EXCEPTION 'Apenas emails @fsconsultores.com.br são permitidos'
            USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_email_domain_on_auth_users ON auth.users;
CREATE TRIGGER enforce_email_domain_on_auth_users
BEFORE INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.enforce_email_domain();

CREATE OR REPLACE FUNCTION public.is_authorized_domain()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        LOWER((auth.jwt() ->> 'email')) ~ '^[^@]+@fsconsultores\.com\.br$',
        FALSE
    );
$$;

DELETE FROM auth.users
WHERE LOWER(email) !~ '^[^@]+@fsconsultores\.com\.br$';

DROP POLICY IF EXISTS tabela_orcamentos_owner ON tabela_orcamentos;
CREATE POLICY tabela_orcamentos_owner ON tabela_orcamentos
    FOR ALL TO authenticated
    USING      (user_id = auth.uid() AND public.is_authorized_domain())
    WITH CHECK (user_id = auth.uid() AND public.is_authorized_domain());

DROP POLICY IF EXISTS tabela_itens_orcamento_owner ON tabela_itens_orcamento;
CREATE POLICY tabela_itens_orcamento_owner ON tabela_itens_orcamento
    FOR ALL TO authenticated
    USING (
        public.is_authorized_domain()
        AND EXISTS (SELECT 1 FROM tabela_orcamentos o
                    WHERE o.id = tabela_itens_orcamento.orcamento_id
                      AND o.user_id = auth.uid())
    )
    WITH CHECK (
        public.is_authorized_domain()
        AND EXISTS (SELECT 1 FROM tabela_orcamentos o
                    WHERE o.id = tabela_itens_orcamento.orcamento_id
                      AND o.user_id = auth.uid())
    );

DROP POLICY IF EXISTS tabela_insumos_read          ON tabela_insumos;
DROP POLICY IF EXISTS tabela_composicoes_read      ON tabela_composicoes;
DROP POLICY IF EXISTS tabela_itens_composicao_read ON tabela_itens_composicao;

CREATE POLICY tabela_insumos_read          ON tabela_insumos          FOR SELECT TO authenticated USING (public.is_authorized_domain());
CREATE POLICY tabela_composicoes_read      ON tabela_composicoes      FOR SELECT TO authenticated USING (public.is_authorized_domain());
CREATE POLICY tabela_itens_composicao_read ON tabela_itens_composicao FOR SELECT TO authenticated USING (public.is_authorized_domain());
