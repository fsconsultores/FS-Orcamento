-- =====================================================================
-- Migration: suporte a múltiplas bases de dados
-- Bases externas (SINAPI, DNIT, SUDECAP, DER) + base própria do usuário
-- =====================================================================

-- 1. Tabela de bases
CREATE TABLE tabela_bases (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nome        TEXT        NOT NULL,
    orgao       TEXT        NOT NULL,
    tipo_base   TEXT        NOT NULL CHECK (tipo_base IN ('externa', 'propria')),
    user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Uma base própria por usuário; um órgão externo por nome
CREATE UNIQUE INDEX tabela_bases_propria_por_user ON tabela_bases(user_id) WHERE tipo_base = 'propria';
CREATE UNIQUE INDEX tabela_bases_externa_por_orgao ON tabela_bases(orgao)  WHERE tipo_base = 'externa';

ALTER TABLE tabela_bases ENABLE ROW LEVEL SECURITY;

-- Bases externas: leitura para todos os autenticados
CREATE POLICY tabela_bases_select_externa ON tabela_bases
    FOR SELECT TO authenticated USING (tipo_base = 'externa');

-- Base própria: leitura pelo dono
CREATE POLICY tabela_bases_propria_select ON tabela_bases
    FOR SELECT TO authenticated
    USING (tipo_base = 'propria' AND user_id = auth.uid());

-- Base própria: criação pelo dono (domínio autorizado)
CREATE POLICY tabela_bases_propria_insert ON tabela_bases
    FOR INSERT TO authenticated
    WITH CHECK (tipo_base = 'propria' AND user_id = auth.uid() AND public.is_authorized_domain());

-- Base própria: atualização pelo dono
CREATE POLICY tabela_bases_propria_update ON tabela_bases
    FOR UPDATE TO authenticated
    USING (tipo_base = 'propria' AND user_id = auth.uid() AND public.is_authorized_domain())
    WITH CHECK (tipo_base = 'propria' AND user_id = auth.uid() AND public.is_authorized_domain());

-- Base própria: exclusão pelo dono
CREATE POLICY tabela_bases_propria_delete ON tabela_bases
    FOR DELETE TO authenticated
    USING (tipo_base = 'propria' AND user_id = auth.uid() AND public.is_authorized_domain());

GRANT SELECT ON tabela_bases TO authenticated;

-- 2. Semear bases externas padrão
INSERT INTO tabela_bases (nome, orgao, tipo_base, user_id) VALUES
    ('SINAPI',   'SINAPI',   'externa', NULL),
    ('DNIT',     'DNIT',     'externa', NULL),
    ('SUDECAP',  'SUDECAP',  'externa', NULL),
    ('DER',      'DER',      'externa', NULL);

-- 3. Adicionar base_id às tabelas de biblioteca
ALTER TABLE tabela_insumos     ADD COLUMN IF NOT EXISTS base_id UUID REFERENCES tabela_bases(id) ON DELETE SET NULL;
ALTER TABLE tabela_composicoes ADD COLUMN IF NOT EXISTS base_id UUID REFERENCES tabela_bases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tabela_insumos_base_id_idx    ON tabela_insumos(base_id);
CREATE INDEX IF NOT EXISTS tabela_composicoes_base_id_idx ON tabela_composicoes(base_id);

-- 4. Substituir unicidade global de código por unicidade por base
--    Itens sem base (legados) continuam únicos globalmente entre si.
--    Itens com base só precisam ser únicos dentro da mesma base.
ALTER TABLE tabela_insumos     DROP CONSTRAINT IF EXISTS tabela_insumos_codigo_key;
ALTER TABLE tabela_composicoes DROP CONSTRAINT IF EXISTS tabela_composicoes_codigo_key;

CREATE UNIQUE INDEX IF NOT EXISTS tabela_insumos_codigo_sem_base
    ON tabela_insumos(codigo) WHERE base_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tabela_insumos_codigo_por_base
    ON tabela_insumos(codigo, base_id) WHERE base_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tabela_composicoes_codigo_sem_base
    ON tabela_composicoes(codigo) WHERE base_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tabela_composicoes_codigo_por_base
    ON tabela_composicoes(codigo, base_id) WHERE base_id IS NOT NULL;

-- 5. Atualizar políticas de INSERT/UPDATE/DELETE para bloquear bases externas
--    Bases externas são somente leitura para usuários comuns.

-- Insumos
DROP POLICY IF EXISTS tabela_insumos_insert ON tabela_insumos;
DROP POLICY IF EXISTS tabela_insumos_update ON tabela_insumos;
DROP POLICY IF EXISTS tabela_insumos_delete ON tabela_insumos;

CREATE POLICY tabela_insumos_insert ON tabela_insumos
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_authorized_domain() AND (
            base_id IS NULL OR
            EXISTS (
                SELECT 1 FROM tabela_bases b
                WHERE b.id = base_id AND b.tipo_base = 'propria' AND b.user_id = auth.uid()
            )
        )
    );

CREATE POLICY tabela_insumos_update ON tabela_insumos
    FOR UPDATE TO authenticated
    USING (
        public.is_authorized_domain() AND (
            base_id IS NULL OR
            EXISTS (
                SELECT 1 FROM tabela_bases b
                WHERE b.id = base_id AND b.tipo_base = 'propria' AND b.user_id = auth.uid()
            )
        )
    )
    WITH CHECK (
        public.is_authorized_domain() AND (
            base_id IS NULL OR
            EXISTS (
                SELECT 1 FROM tabela_bases b
                WHERE b.id = base_id AND b.tipo_base = 'propria' AND b.user_id = auth.uid()
            )
        )
    );

CREATE POLICY tabela_insumos_delete ON tabela_insumos
    FOR DELETE TO authenticated
    USING (
        public.is_authorized_domain() AND (
            base_id IS NULL OR
            EXISTS (
                SELECT 1 FROM tabela_bases b
                WHERE b.id = base_id AND b.tipo_base = 'propria' AND b.user_id = auth.uid()
            )
        )
    );

-- Composições
DROP POLICY IF EXISTS tabela_composicoes_insert ON tabela_composicoes;
DROP POLICY IF EXISTS tabela_composicoes_update ON tabela_composicoes;
DROP POLICY IF EXISTS tabela_composicoes_delete ON tabela_composicoes;

CREATE POLICY tabela_composicoes_insert ON tabela_composicoes
    FOR INSERT TO authenticated
    WITH CHECK (
        public.is_authorized_domain() AND (
            base_id IS NULL OR
            EXISTS (
                SELECT 1 FROM tabela_bases b
                WHERE b.id = base_id AND b.tipo_base = 'propria' AND b.user_id = auth.uid()
            )
        )
    );

CREATE POLICY tabela_composicoes_update ON tabela_composicoes
    FOR UPDATE TO authenticated
    USING (
        public.is_authorized_domain() AND (
            base_id IS NULL OR
            EXISTS (
                SELECT 1 FROM tabela_bases b
                WHERE b.id = base_id AND b.tipo_base = 'propria' AND b.user_id = auth.uid()
            )
        )
    )
    WITH CHECK (
        public.is_authorized_domain() AND (
            base_id IS NULL OR
            EXISTS (
                SELECT 1 FROM tabela_bases b
                WHERE b.id = base_id AND b.tipo_base = 'propria' AND b.user_id = auth.uid()
            )
        )
    );

CREATE POLICY tabela_composicoes_delete ON tabela_composicoes
    FOR DELETE TO authenticated
    USING (
        public.is_authorized_domain() AND (
            base_id IS NULL OR
            EXISTS (
                SELECT 1 FROM tabela_bases b
                WHERE b.id = base_id AND b.tipo_base = 'propria' AND b.user_id = auth.uid()
            )
        )
    );

-- 6. Atualizar view vw_custo_composicao para incluir info de base
--    ATENÇÃO: custo_unitario deve permanecer na posição 5 (igual à view original).
--    CREATE OR REPLACE VIEW não permite alterar ordem/nome de colunas existentes.
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
