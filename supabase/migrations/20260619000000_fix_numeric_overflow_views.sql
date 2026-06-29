-- Corrige overflow numérico nas views e também garante que objetos de migrations
-- anteriores existam (tabela_bases, colunas base_id/base_origem) caso tenham
-- falhado silenciosamente em algum deploy anterior.

-- ── 1. Tabela de bases (idempotente) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tabela_bases (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    nome        TEXT        NOT NULL,
    orgao       TEXT        NOT NULL,
    tipo_base   TEXT        NOT NULL CHECK (tipo_base IN ('externa', 'propria')),
    user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tabela_bases_propria_por_user
    ON public.tabela_bases(user_id) WHERE tipo_base = 'propria';
CREATE UNIQUE INDEX IF NOT EXISTS tabela_bases_externa_por_orgao
    ON public.tabela_bases(orgao)  WHERE tipo_base = 'externa';

-- Semear bases externas padrão (ignorar duplicatas)
INSERT INTO public.tabela_bases (nome, orgao, tipo_base, user_id)
VALUES
    ('SINAPI',  'SINAPI',  'externa', NULL),
    ('DNIT',    'DNIT',    'externa', NULL),
    ('SUDECAP', 'SUDECAP', 'externa', NULL),
    ('DER',     'DER',     'externa', NULL)
ON CONFLICT DO NOTHING;

-- ── 2. Colunas auxiliares em tabela_composicoes (idempotente) ────────────────
ALTER TABLE public.tabela_composicoes
    ADD COLUMN IF NOT EXISTS base_id     UUID REFERENCES public.tabela_bases(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS base_origem TEXT;

ALTER TABLE public.tabela_insumos
    ADD COLUMN IF NOT EXISTS base_id UUID REFERENCES public.tabela_bases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS tabela_composicoes_base_id_idx ON public.tabela_composicoes(base_id);
CREATE INDEX IF NOT EXISTS tabela_insumos_base_id_idx     ON public.tabela_insumos(base_id);

-- ── 3. Função de custo de composição ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calcular_custo_composicao(p_composicao_id UUID)
RETURNS NUMERIC AS $$
    SELECT ROUND(COALESCE(SUM(ic.indice * i.preco_base), 0), 4)
    FROM public.tabela_itens_composicao ic
    JOIN public.tabela_insumos i ON i.id = ic.insumo_id
    WHERE ic.composicao_id = p_composicao_id;
$$ LANGUAGE sql STABLE;

-- ── 4. Views com ROUND (sem cast que causa overflow) ─────────────────────────
DROP VIEW IF EXISTS public.vw_total_orcamento;
DROP VIEW IF EXISTS public.vw_custo_composicao;

CREATE VIEW public.vw_custo_composicao AS
SELECT
    c.id,
    c.codigo,
    c.descricao,
    c.unidade,
    ROUND(COALESCE(SUM(ic.indice * i.preco_base), 0), 4) AS custo_unitario,
    c.base_id,
    b.orgao,
    b.tipo_base,
    c.base_origem
FROM public.tabela_composicoes c
LEFT JOIN public.tabela_bases b             ON b.id = c.base_id
LEFT JOIN public.tabela_itens_composicao ic ON ic.composicao_id = c.id
LEFT JOIN public.tabela_insumos i           ON i.id = ic.insumo_id
GROUP BY c.id, c.codigo, c.descricao, c.unidade, c.base_id, b.orgao, b.tipo_base, c.base_origem;

GRANT SELECT ON public.vw_custo_composicao TO authenticated;

CREATE OR REPLACE VIEW public.vw_total_orcamento AS
SELECT
    o.id AS orcamento_id,
    o.user_id,
    o.nome_obra,
    ROUND(COALESCE(SUM(io.quantidade * vc.custo_unitario), 0), 4) AS total_sem_bdi,
    ROUND(COALESCE(
        SUM(
            io.quantidade
            * vc.custo_unitario
            * (1 + COALESCE(io.bdi_especifico, o.bdi_global) / 100.0)
        ),
        0
    ), 4) AS total_com_bdi
FROM public.tabela_orcamentos o
LEFT JOIN public.tabela_itens_orcamento io ON io.orcamento_id = o.id
LEFT JOIN public.vw_custo_composicao    vc ON vc.id = io.composicao_id
GROUP BY o.id, o.user_id, o.nome_obra;

GRANT SELECT ON public.vw_total_orcamento TO authenticated;
