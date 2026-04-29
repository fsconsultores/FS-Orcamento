-- =====================================================================
-- SISTEMA DE ORÇAMENTO DE OBRAS - SCHEMA SUPABASE / POSTGRESQL
-- Multi-tenant SaaS, RLS habilitado, UUID, integridade relacional.
-- Rodar tudo de uma vez no SQL Editor do Supabase.
-- =====================================================================

-- ---------- Extensões ----------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- busca textual em insumos/composições

-- ---------- Tipos enumerados ----------
DO $$ BEGIN
    CREATE TYPE tipo_insumo AS ENUM ('material','mao_de_obra','equipamento','servico_terceirizado','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE status_orcamento AS ENUM ('rascunho','em_revisao','finalizado','aprovado','rejeitado','arquivado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE tipo_item_orcamento AS ENUM ('composicao','insumo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Função utilitária: trigger de updated_at ----------
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1) HIERARQUIA DE ORGANIZAÇÃO: folders -> projects -> orcamentos
-- =====================================================================

CREATE TABLE folders (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome        TEXT        NOT NULL CHECK (length(trim(nome)) > 0),
    descricao   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_folders_user_id ON folders(user_id);
CREATE TRIGGER set_updated_at_folders
    BEFORE UPDATE ON folders FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE projects (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    folder_id   UUID        REFERENCES folders(id) ON DELETE SET NULL,
    nome        TEXT        NOT NULL CHECK (length(trim(nome)) > 0),
    descricao   TEXT,
    cliente     TEXT,
    endereco    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_user_id   ON projects(user_id);
CREATE INDEX idx_projects_folder_id ON projects(folder_id);
CREATE TRIGGER set_updated_at_projects
    BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =====================================================================
-- 2) BIBLIOTECA: insumos, composicoes, itens_composicao
--    user_id NULL  => registro "público/sistema" (ex: SINAPI base)
--    user_id <uid> => biblioteca privada do usuário
-- =====================================================================

CREATE TABLE insumos (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID         REFERENCES auth.users(id) ON DELETE CASCADE,
    codigo          TEXT         NOT NULL,
    descricao       TEXT         NOT NULL CHECK (length(trim(descricao)) > 0),
    unidade         TEXT         NOT NULL,
    tipo            tipo_insumo  NOT NULL DEFAULT 'material',
    preco_base      NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (preco_base >= 0),
    fonte           TEXT,                     -- 'SINAPI','SBC','PROPRIO',...
    data_referencia DATE,
    ativo           BOOLEAN      NOT NULL DEFAULT true,
    observacoes     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- código único por escopo (mesmo NULL conta como igual)
    CONSTRAINT uq_insumo_codigo UNIQUE NULLS NOT DISTINCT (user_id, codigo)
);
CREATE INDEX idx_insumos_user_id    ON insumos(user_id);
CREATE INDEX idx_insumos_codigo     ON insumos(codigo);
CREATE INDEX idx_insumos_descricao  ON insumos USING gin (descricao gin_trgm_ops);
CREATE TRIGGER set_updated_at_insumos
    BEFORE UPDATE ON insumos FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE composicoes (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID         REFERENCES auth.users(id) ON DELETE CASCADE,
    codigo          TEXT         NOT NULL,
    descricao       TEXT         NOT NULL CHECK (length(trim(descricao)) > 0),
    unidade         TEXT         NOT NULL,
    fonte           TEXT,
    data_referencia DATE,
    ativo           BOOLEAN      NOT NULL DEFAULT true,
    observacoes     TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_composicao_codigo UNIQUE NULLS NOT DISTINCT (user_id, codigo)
);
CREATE INDEX idx_composicoes_user_id   ON composicoes(user_id);
CREATE INDEX idx_composicoes_codigo    ON composicoes(codigo);
CREATE INDEX idx_composicoes_descricao ON composicoes USING gin (descricao gin_trgm_ops);
CREATE TRIGGER set_updated_at_composicoes
    BEFORE UPDATE ON composicoes FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

CREATE TABLE itens_composicao (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    composicao_id UUID         NOT NULL REFERENCES composicoes(id) ON DELETE CASCADE,
    insumo_id     UUID         NOT NULL REFERENCES insumos(id)     ON DELETE RESTRICT,
    coeficiente   NUMERIC(14,6) NOT NULL CHECK (coeficiente > 0),
    observacao    TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_item_composicao UNIQUE (composicao_id, insumo_id)
);
CREATE INDEX idx_itens_composicao_composicao ON itens_composicao(composicao_id);
CREATE INDEX idx_itens_composicao_insumo     ON itens_composicao(insumo_id);

-- =====================================================================
-- 3) ORÇAMENTOS, ETAPAS E ITENS
-- =====================================================================

CREATE TABLE orcamentos (
    id             UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID             NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id     UUID             REFERENCES projects(id) ON DELETE SET NULL,
    nome_obra      TEXT             NOT NULL CHECK (length(trim(nome_obra)) > 0),
    cliente        TEXT,
    data_orcamento DATE             NOT NULL DEFAULT CURRENT_DATE,
    bdi_global     NUMERIC(7,4)     NOT NULL DEFAULT 0 CHECK (bdi_global >= 0),
    status         status_orcamento NOT NULL DEFAULT 'rascunho',
    observacoes    TEXT,
    created_at     TIMESTAMPTZ      NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX idx_orcamentos_user_id    ON orcamentos(user_id);
CREATE INDEX idx_orcamentos_project_id ON orcamentos(project_id);
CREATE TRIGGER set_updated_at_orcamentos
    BEFORE UPDATE ON orcamentos FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- Etapas opcionais (Fundação, Estrutura, Acabamento...) - melhora UX e relatórios
CREATE TABLE etapas_orcamento (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    orcamento_id UUID        NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
    nome         TEXT        NOT NULL CHECK (length(trim(nome)) > 0),
    ordem        INTEGER     NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_etapas_orcamento ON etapas_orcamento(orcamento_id);

-- Itens do orçamento: aceitam composição OU insumo direto, e congelam preço
CREATE TABLE itens_orcamento (
    id                       UUID                PRIMARY KEY DEFAULT uuid_generate_v4(),
    orcamento_id             UUID                NOT NULL REFERENCES orcamentos(id)       ON DELETE CASCADE,
    etapa_id                 UUID                REFERENCES etapas_orcamento(id)          ON DELETE SET NULL,
    tipo                     tipo_item_orcamento NOT NULL,
    composicao_id            UUID                REFERENCES composicoes(id)               ON DELETE RESTRICT,
    insumo_id                UUID                REFERENCES insumos(id)                   ON DELETE RESTRICT,

    -- Snapshot: preserva o que foi orçado mesmo se a base mudar depois
    descricao_snapshot       TEXT                NOT NULL,
    unidade_snapshot         TEXT                NOT NULL,
    preco_unitario_snapshot  NUMERIC(14,4)       NOT NULL CHECK (preco_unitario_snapshot >= 0),

    quantidade               NUMERIC(14,4)       NOT NULL CHECK (quantidade > 0),
    bdi_especifico           NUMERIC(7,4)        CHECK (bdi_especifico >= 0),  -- override do bdi_global
    ordem                    INTEGER             NOT NULL DEFAULT 0,
    observacao               TEXT,
    created_at               TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ         NOT NULL DEFAULT now(),

    -- Garante coerência: exatamente uma referência conforme o tipo
    CONSTRAINT chk_item_referencia CHECK (
        (tipo = 'composicao' AND composicao_id IS NOT NULL AND insumo_id IS NULL) OR
        (tipo = 'insumo'     AND insumo_id IS NOT NULL AND composicao_id IS NULL)
    )
);
CREATE INDEX idx_itens_orcamento_orcamento ON itens_orcamento(orcamento_id);
CREATE INDEX idx_itens_orcamento_etapa     ON itens_orcamento(etapa_id);
CREATE TRIGGER set_updated_at_itens_orcamento
    BEFORE UPDATE ON itens_orcamento FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- =====================================================================
-- 4) VIEWS DE CÁLCULO (custo em tempo real)
-- =====================================================================

-- Custo unitário ATUAL de cada composição (somatório dos insumos)
CREATE OR REPLACE VIEW vw_custo_composicao AS
SELECT
    c.id          AS composicao_id,
    c.user_id,
    c.codigo,
    c.descricao,
    c.unidade,
    COALESCE(SUM(ic.coeficiente * i.preco_base), 0)::NUMERIC(14,4) AS custo_unitario
FROM composicoes c
LEFT JOIN itens_composicao ic ON ic.composicao_id = c.id
LEFT JOIN insumos i           ON i.id            = ic.insumo_id
GROUP BY c.id, c.user_id, c.codigo, c.descricao, c.unidade;

-- Total por item do orçamento (com BDI aplicado)
CREATE OR REPLACE VIEW vw_total_item_orcamento AS
SELECT
    io.id,
    io.orcamento_id,
    io.etapa_id,
    io.descricao_snapshot,
    io.unidade_snapshot,
    io.quantidade,
    io.preco_unitario_snapshot,
    (io.quantidade * io.preco_unitario_snapshot)::NUMERIC(14,4) AS subtotal,
    COALESCE(io.bdi_especifico, o.bdi_global) AS bdi_aplicado,
    ((io.quantidade * io.preco_unitario_snapshot)
        * (1 + COALESCE(io.bdi_especifico, o.bdi_global)))::NUMERIC(14,4) AS total_com_bdi
FROM itens_orcamento io
JOIN orcamentos o ON o.id = io.orcamento_id;

-- Total geral do orçamento
CREATE OR REPLACE VIEW vw_total_orcamento AS
SELECT
    o.id           AS orcamento_id,
    o.user_id,
    o.nome_obra,
    o.status,
    COALESCE(SUM(v.subtotal), 0)::NUMERIC(14,4)      AS subtotal_sem_bdi,
    COALESCE(SUM(v.total_com_bdi), 0)::NUMERIC(14,4) AS total_com_bdi
FROM orcamentos o
LEFT JOIN vw_total_item_orcamento v ON v.orcamento_id = o.id
GROUP BY o.id, o.user_id, o.nome_obra, o.status;

-- =====================================================================
-- 5) ROW LEVEL SECURITY (multi-tenant)
-- =====================================================================

ALTER TABLE folders          ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE composicoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_composicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE etapas_orcamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_orcamento  ENABLE ROW LEVEL SECURITY;

-- Folders / Projects / Orçamentos: dono total
CREATE POLICY folders_owner    ON folders    FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY projects_owner   ON projects   FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY orcamentos_owner ON orcamentos FOR ALL TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Insumos: leitura pública (user_id IS NULL) + leitura/escrita do próprio
CREATE POLICY insumos_select ON insumos FOR SELECT TO authenticated
    USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY insumos_insert ON insumos FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
CREATE POLICY insumos_update ON insumos FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY insumos_delete ON insumos FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- Composições: mesma lógica
CREATE POLICY composicoes_select ON composicoes FOR SELECT TO authenticated
    USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY composicoes_insert ON composicoes FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
CREATE POLICY composicoes_update ON composicoes FOR UPDATE TO authenticated
    USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY composicoes_delete ON composicoes FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- Itens de composição: acessa via composição-pai
CREATE POLICY itens_composicao_select ON itens_composicao FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM composicoes c
        WHERE c.id = itens_composicao.composicao_id
          AND (c.user_id IS NULL OR c.user_id = auth.uid())
    ));
CREATE POLICY itens_composicao_write ON itens_composicao FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM composicoes c
        WHERE c.id = itens_composicao.composicao_id AND c.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM composicoes c
        WHERE c.id = itens_composicao.composicao_id AND c.user_id = auth.uid()
    ));

-- Etapas e itens de orçamento: acessa via orçamento-pai
CREATE POLICY etapas_orcamento_owner ON etapas_orcamento FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM orcamentos o WHERE o.id = etapas_orcamento.orcamento_id AND o.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM orcamentos o WHERE o.id = etapas_orcamento.orcamento_id AND o.user_id = auth.uid()));

CREATE POLICY itens_orcamento_owner ON itens_orcamento FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM orcamentos o WHERE o.id = itens_orcamento.orcamento_id AND o.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM orcamentos o WHERE o.id = itens_orcamento.orcamento_id AND o.user_id = auth.uid()));

-- =====================================================================
-- 6) FUNÇÃO AUXILIAR: custo unitário de composição (uso programático)
-- =====================================================================

CREATE OR REPLACE FUNCTION calcular_custo_composicao(p_composicao_id UUID)
RETURNS NUMERIC AS $$
    SELECT COALESCE(SUM(ic.coeficiente * i.preco_base), 0)::NUMERIC(14,4)
    FROM itens_composicao ic
    JOIN insumos i ON i.id = ic.insumo_id
    WHERE ic.composicao_id = p_composicao_id;
$$ LANGUAGE sql STABLE;
