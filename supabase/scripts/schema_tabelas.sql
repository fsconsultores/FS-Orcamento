-- =====================================================================
-- SISTEMA DE ORÇAMENTO DE OBRAS - SCHEMA SUPABASE
-- Tabelas: insumos, composicoes, itens_composicao, orcamentos, itens_orcamento
-- =====================================================================

-- Extensão para geração de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1) tabela_insumos
-- =====================================================================
CREATE TABLE tabela_insumos (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo          TEXT          NOT NULL,
    descricao       TEXT          NOT NULL CHECK (length(trim(descricao)) > 0),
    unidade         TEXT          NOT NULL,
    preco_base      NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (preco_base >= 0),
    fonte           TEXT,
    data_referencia DATE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT uq_insumo_codigo UNIQUE (codigo)
);

CREATE INDEX idx_insumos_codigo ON tabela_insumos(codigo);

-- =====================================================================
-- 2) tabela_composicoes
-- =====================================================================
CREATE TABLE tabela_composicoes (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo      TEXT        NOT NULL,
    descricao   TEXT        NOT NULL CHECK (length(trim(descricao)) > 0),
    unidade     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_composicao_codigo UNIQUE (codigo)
);

CREATE INDEX idx_composicoes_codigo ON tabela_composicoes(codigo);

-- =====================================================================
-- 3) tabela_itens_composicao
-- =====================================================================
CREATE TABLE tabela_itens_composicao (
    id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    composicao_id UUID          NOT NULL REFERENCES tabela_composicoes(id) ON DELETE CASCADE,
    insumo_id     UUID          NOT NULL REFERENCES tabela_insumos(id)     ON DELETE RESTRICT,
    indice        NUMERIC(14,6) NOT NULL CHECK (indice > 0),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT uq_item_composicao UNIQUE (composicao_id, insumo_id)
);

CREATE INDEX idx_itens_composicao_composicao ON tabela_itens_composicao(composicao_id);
CREATE INDEX idx_itens_composicao_insumo     ON tabela_itens_composicao(insumo_id);

-- =====================================================================
-- 4) tabela_orcamentos
-- =====================================================================
CREATE TABLE tabela_orcamentos (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome_obra   TEXT         NOT NULL CHECK (length(trim(nome_obra)) > 0),
    cliente     TEXT,
    data        DATE         NOT NULL DEFAULT CURRENT_DATE,
    bdi_global  NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (bdi_global >= 0),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_orcamentos_user_id ON tabela_orcamentos(user_id);

-- =====================================================================
-- 5) tabela_itens_orcamento
-- =====================================================================
CREATE TABLE tabela_itens_orcamento (
    id              UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    orcamento_id    UUID          NOT NULL REFERENCES tabela_orcamentos(id)  ON DELETE CASCADE,
    composicao_id   UUID          NOT NULL REFERENCES tabela_composicoes(id) ON DELETE RESTRICT,
    quantidade      NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
    bdi_especifico  NUMERIC(7,4)  CHECK (bdi_especifico >= 0),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_itens_orcamento_orcamento  ON tabela_itens_orcamento(orcamento_id);
CREATE INDEX idx_itens_orcamento_composicao ON tabela_itens_orcamento(composicao_id);

-- =====================================================================
-- 6) ROW LEVEL SECURITY (multi-tenant)
-- Apenas tabelas com user_id direto ou indireto.
-- Insumos e composições ficam globais (biblioteca compartilhada).
-- =====================================================================

ALTER TABLE tabela_orcamentos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabela_itens_orcamento ENABLE ROW LEVEL SECURITY;

CREATE POLICY orcamentos_owner ON tabela_orcamentos
    FOR ALL TO authenticated
    USING      (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY itens_orcamento_owner ON tabela_itens_orcamento
    FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM tabela_orcamentos o
        WHERE o.id = tabela_itens_orcamento.orcamento_id
          AND o.user_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM tabela_orcamentos o
        WHERE o.id = tabela_itens_orcamento.orcamento_id
          AND o.user_id = auth.uid()
    ));

-- Biblioteca pública: liberar leitura para autenticados
ALTER TABLE tabela_insumos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabela_composicoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabela_itens_composicao ENABLE ROW LEVEL SECURITY;

CREATE POLICY insumos_read          ON tabela_insumos          FOR SELECT TO authenticated USING (true);
CREATE POLICY composicoes_read      ON tabela_composicoes      FOR SELECT TO authenticated USING (true);
CREATE POLICY itens_composicao_read ON tabela_itens_composicao FOR SELECT TO authenticated USING (true);
-- Escrita na biblioteca fica restrita (apenas via service_role/admin).
