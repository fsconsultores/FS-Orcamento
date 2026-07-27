-- =====================================================================
-- Orçamentos abertos para todo o domínio (ver E editar)
-- =====================================================================
-- Até aqui, tabela_orcamentos e toda tabela dependente (planilhas,
-- estrutura, insumos/composições do orçamento, versões, logs) tinham RLS
-- "somente o dono" (user_id = auth.uid()) para tudo — SELECT/INSERT/
-- UPDATE/DELETE — então um usuário não conseguia nem VER, quanto mais
-- editar, o orçamento de outro colega. Mesmo sendo um sistema single-
-- tenant onde todo mundo é da mesma empresa (@fsconsultores.com.br).
--
-- Pedido: qualquer usuário autenticado do domínio pode ver E mexer em
-- qualquer orçamento — sem restrição de dono nenhuma daqui pra frente.
--
-- Estratégia: RLS combina múltiplas políticas permissivas com OR, então
-- em vez de reescrever (e arriscar quebrar) cada FOR ALL dono-only
-- existente, este migration ADICIONA uma política nova FOR ALL só com o
-- check de domínio em cada tabela. A política de dono antiga continua
-- existindo por baixo (registro/reversibilidade — se um dia quiser voltar
-- a restringir escrita ao dono, basta dropar só a policy "_domain" nova
-- que a antiga volta a valer sozinha), mas fica redundante na prática:
-- a nova já libera geral.
--
-- Tabela `favoritos` (mesmo com entity_type='orcamento') NÃO entra aqui
-- de propósito: é lista pessoal de atalhos de cada usuário, não o
-- orçamento em si.
-- =====================================================================

-- tabela_orcamentos
CREATE POLICY tabela_orcamentos_domain ON tabela_orcamentos
    FOR ALL TO authenticated
    USING      (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

-- tabela_itens_orcamento (planilha "legada", ainda referenciada por
-- algumas views/relatórios)
CREATE POLICY tabela_itens_orcamento_domain ON tabela_itens_orcamento
    FOR ALL TO authenticated
    USING      (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

-- orcamento_planilhas
CREATE POLICY orcamento_planilhas_domain ON orcamento_planilhas
    FOR ALL TO authenticated
    USING      (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

-- orcamento_estrutura
CREATE POLICY orcamento_estrutura_domain ON orcamento_estrutura
    FOR ALL TO authenticated
    USING      (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

-- orcamento_insumos
CREATE POLICY orcamento_insumos_domain ON orcamento_insumos
    FOR ALL TO authenticated
    USING      (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

-- orcamento_composicoes
CREATE POLICY orcamento_composicoes_domain ON orcamento_composicoes
    FOR ALL TO authenticated
    USING      (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

-- orcamento_versoes
CREATE POLICY orcamento_versoes_domain ON orcamento_versoes
    FOR ALL TO authenticated
    USING      (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

-- orcamento_logs (tabela legada, substituída por historico_alteracoes
-- que já é aberta a todo o domínio — mantido por completude)
CREATE POLICY orcamento_logs_domain ON orcamento_logs
    FOR ALL TO authenticated
    USING      (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

-- orcamento_servicos_estimados
CREATE POLICY orcamento_servicos_estimados_domain ON orcamento_servicos_estimados
    FOR ALL TO authenticated
    USING      (public.is_authorized_domain())
    WITH CHECK (public.is_authorized_domain());

NOTIFY pgrst, 'reload schema';
