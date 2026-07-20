-- =====================================================================
-- Migration: Favoritos (Epic 2 — Fase 1)
-- Tabela única e polimórfica para favoritar insumos, composições,
-- orçamentos e bases. Cada usuário só vê/gerencia os próprios favoritos.
-- =====================================================================

-- Idempotente de propósito: uma tentativa anterior desta migração já pode ter
-- criado a tabela/políticas antes de falhar mais abaixo (na view). Seguro
-- rodar de novo do zero ou a partir de um estado parcial.
CREATE TABLE IF NOT EXISTS favoritos (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    entity_type TEXT        NOT NULL CHECK (entity_type IN ('insumo', 'composicao', 'orcamento', 'base')),
    entity_id   UUID        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS favoritos_user_entity_idx ON favoritos(user_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS favoritos_user_type_idx ON favoritos(user_id, entity_type, created_at DESC);

ALTER TABLE favoritos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS favoritos_select ON favoritos;
CREATE POLICY favoritos_select ON favoritos
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS favoritos_insert ON favoritos;
CREATE POLICY favoritos_insert ON favoritos
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS favoritos_delete ON favoritos;
CREATE POLICY favoritos_delete ON favoritos
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON favoritos TO authenticated;

-- ---------------------------------------------------------------------
-- Computed columns do PostgREST: permitem `.select('..., is_favorito')` e
-- `.order('is_favorito', {ascending:false})` direto nas queries existentes
-- de tabela_insumos/tabela_orcamentos/tabela_bases, com a ordenação
-- rodando no Postgres ANTES da paginação (LIMIT/OFFSET) — importante pois
-- bases como SINAPI têm dezenas de milhares de linhas.
-- SECURITY INVOKER (padrão) — respeita a RLS de `favoritos` via auth.uid()
-- de quem chama.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_favorito(tabela_insumos) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM favoritos f
        WHERE f.entity_type = 'insumo' AND f.entity_id = $1.id AND f.user_id = auth.uid()
    )
$$;

CREATE OR REPLACE FUNCTION public.is_favorito(tabela_orcamentos) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM favoritos f
        WHERE f.entity_type = 'orcamento' AND f.entity_id = $1.id AND f.user_id = auth.uid()
    )
$$;

CREATE OR REPLACE FUNCTION public.is_favorito(tabela_bases) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM favoritos f
        WHERE f.entity_type = 'base' AND f.entity_id = $1.id AND f.user_id = auth.uid()
    )
$$;

-- Composições são listadas a partir de vw_custo_composicao (não direto da
-- tabela) — mais simples embutir a coluna na própria view do que criar um
-- computed column separado. Adiciona is_favorito no FINAL (mesma regra já
-- documentada nesta view: não pode reordenar/renomear colunas existentes).
--
-- ATENÇÃO: custo_unitario aqui usa ROUND(...) (tipo `numeric` puro), igual à
-- definição vigente em 20260619000000_fix_numeric_overflow_views.sql — NÃO
-- usar `::NUMERIC(14,4)` (versão antiga, já substituída), pois CREATE OR
-- REPLACE VIEW não permite mudar o tipo de uma coluna existente.
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
    ) AS is_favorito
FROM tabela_composicoes c
LEFT JOIN tabela_bases b             ON b.id = c.base_id
LEFT JOIN tabela_itens_composicao ic ON ic.composicao_id = c.id
LEFT JOIN tabela_insumos i           ON i.id = ic.insumo_id
GROUP BY c.id, c.codigo, c.descricao, c.unidade, c.base_id, b.orgao, b.tipo_base, c.base_origem;

GRANT SELECT ON vw_custo_composicao TO authenticated;

NOTIFY pgrst, 'reload schema';
