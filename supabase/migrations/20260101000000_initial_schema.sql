-- =====================================================================
-- Migration: schema inicial
-- =====================================================================

-- Tabelas de biblioteca
CREATE TABLE tabela_insumos (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo          TEXT          NOT NULL,
    descricao       TEXT          NOT NULL CHECK (length(trim(descricao)) > 0),
    unidade         TEXT          NOT NULL,
    preco_base      NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (preco_base >= 0),
    fonte           TEXT,
    data_referencia DATE,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT tabela_insumos_codigo_key UNIQUE (codigo)
);
CREATE INDEX tabela_insumos_codigo_idx ON tabela_insumos(codigo);

CREATE TABLE tabela_composicoes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo      TEXT        NOT NULL,
    descricao   TEXT        NOT NULL CHECK (length(trim(descricao)) > 0),
    unidade     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tabela_composicoes_codigo_key UNIQUE (codigo)
);
CREATE INDEX tabela_composicoes_codigo_idx ON tabela_composicoes(codigo);

CREATE TABLE tabela_itens_composicao (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    composicao_id UUID          NOT NULL REFERENCES tabela_composicoes(id) ON DELETE CASCADE,
    insumo_id     UUID          NOT NULL REFERENCES tabela_insumos(id)     ON DELETE RESTRICT,
    indice        NUMERIC(14,6) NOT NULL CHECK (indice > 0),
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT tabela_itens_composicao_par_key UNIQUE (composicao_id, insumo_id)
);
CREATE INDEX tabela_itens_composicao_composicao_idx ON tabela_itens_composicao(composicao_id);
CREATE INDEX tabela_itens_composicao_insumo_idx     ON tabela_itens_composicao(insumo_id);

-- Orçamentos
CREATE TABLE tabela_orcamentos (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome_obra   TEXT         NOT NULL CHECK (length(trim(nome_obra)) > 0),
    cliente     TEXT,
    data        DATE         NOT NULL DEFAULT CURRENT_DATE,
    bdi_global  NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (bdi_global >= 0),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX tabela_orcamentos_user_id_idx ON tabela_orcamentos(user_id);

CREATE TABLE tabela_itens_orcamento (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    orcamento_id    UUID          NOT NULL REFERENCES tabela_orcamentos(id)  ON DELETE CASCADE,
    composicao_id   UUID          NOT NULL REFERENCES tabela_composicoes(id) ON DELETE RESTRICT,
    quantidade      NUMERIC(14,4) NOT NULL CHECK (quantidade > 0),
    bdi_especifico  NUMERIC(7,4)  CHECK (bdi_especifico >= 0),
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX tabela_itens_orcamento_orcamento_idx  ON tabela_itens_orcamento(orcamento_id);
CREATE INDEX tabela_itens_orcamento_composicao_idx ON tabela_itens_orcamento(composicao_id);

-- Row Level Security
ALTER TABLE tabela_insumos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabela_composicoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabela_itens_composicao ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabela_orcamentos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabela_itens_orcamento  ENABLE ROW LEVEL SECURITY;

CREATE POLICY tabela_insumos_read          ON tabela_insumos          FOR SELECT TO authenticated USING (true);
CREATE POLICY tabela_composicoes_read      ON tabela_composicoes      FOR SELECT TO authenticated USING (true);
CREATE POLICY tabela_itens_composicao_read ON tabela_itens_composicao FOR SELECT TO authenticated USING (true);

CREATE POLICY tabela_orcamentos_owner ON tabela_orcamentos
    FOR ALL TO authenticated
    USING      (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY tabela_itens_orcamento_owner ON tabela_itens_orcamento
    FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM tabela_orcamentos o WHERE o.id = tabela_itens_orcamento.orcamento_id AND o.user_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM tabela_orcamentos o WHERE o.id = tabela_itens_orcamento.orcamento_id AND o.user_id = auth.uid()));

-- Cálculo de custo
CREATE OR REPLACE FUNCTION calcular_custo_composicao(p_composicao_id UUID)
RETURNS NUMERIC AS $$
    SELECT COALESCE(SUM(ic.indice * i.preco_base), 0)::NUMERIC(14,4)
    FROM tabela_itens_composicao ic
    JOIN tabela_insumos i ON i.id = ic.insumo_id
    WHERE ic.composicao_id = p_composicao_id;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE VIEW vw_custo_composicao AS
SELECT c.id, c.codigo, c.descricao, c.unidade,
       COALESCE(SUM(ic.indice * i.preco_base), 0)::NUMERIC(14,4) AS custo_unitario
FROM tabela_composicoes c
LEFT JOIN tabela_itens_composicao ic ON ic.composicao_id = c.id
LEFT JOIN tabela_insumos i           ON i.id = ic.insumo_id
GROUP BY c.id, c.codigo, c.descricao, c.unidade;

CREATE OR REPLACE VIEW vw_total_orcamento AS
SELECT o.id AS orcamento_id, o.user_id, o.nome_obra,
       COALESCE(SUM(io.quantidade * vc.custo_unitario), 0)::NUMERIC(14,4) AS total_sem_bdi,
       COALESCE(SUM(io.quantidade * vc.custo_unitario
           * (1 + COALESCE(io.bdi_especifico, o.bdi_global))), 0)::NUMERIC(14,4) AS total_com_bdi
FROM tabela_orcamentos o
LEFT JOIN tabela_itens_orcamento io ON io.orcamento_id = o.id
LEFT JOIN vw_custo_composicao   vc  ON vc.id = io.composicao_id
GROUP BY o.id, o.user_id, o.nome_obra;
