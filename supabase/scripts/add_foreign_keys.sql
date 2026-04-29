-- =====================================================================
-- FOREIGN KEYS + ÍNDICES
-- Idempotente: pode rodar quantas vezes quiser.
-- =====================================================================

-- 1) Remove FKs antigas (de qualquer nome) nas colunas-alvo.
--    Isso garante que o script funcione mesmo se já houver FK criada
--    com nome diferente (ex: auto-gerado pelo Postgres).
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT con.conname AS cname, c.relname AS tname
        FROM pg_constraint con
        JOIN pg_class      c ON c.oid = con.conrelid
        JOIN pg_namespace  n ON n.oid = c.relnamespace
        JOIN pg_attribute  a ON a.attrelid = c.oid AND a.attnum = ANY(con.conkey)
        WHERE n.nspname = 'public'
          AND con.contype = 'f'
          AND (
              (c.relname = 'tabela_itens_composicao' AND a.attname IN ('composicao_id','insumo_id'))
           OR (c.relname = 'tabela_itens_orcamento'  AND a.attname IN ('orcamento_id','composicao_id'))
          )
    LOOP
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', rec.tname, rec.cname);
    END LOOP;
END $$;

-- 2) Adiciona as FKs com nomes previsíveis e regras corretas.

-- 2.1) tabela_itens_composicao → tabela_composicoes
--      Item da composição não existe sem a composição → CASCADE
ALTER TABLE tabela_itens_composicao
    ADD CONSTRAINT tabela_itens_composicao_composicao_fkey
    FOREIGN KEY (composicao_id)
    REFERENCES tabela_composicoes(id)
    ON DELETE CASCADE;

-- 2.2) tabela_itens_composicao → tabela_insumos
--      Insumo é referência mestre. Se está em uso, bloquear exclusão → RESTRICT
ALTER TABLE tabela_itens_composicao
    ADD CONSTRAINT tabela_itens_composicao_insumo_fkey
    FOREIGN KEY (insumo_id)
    REFERENCES tabela_insumos(id)
    ON DELETE RESTRICT;

-- 2.3) tabela_itens_orcamento → tabela_orcamentos
--      Item do orçamento não existe sem o orçamento → CASCADE
ALTER TABLE tabela_itens_orcamento
    ADD CONSTRAINT tabela_itens_orcamento_orcamento_fkey
    FOREIGN KEY (orcamento_id)
    REFERENCES tabela_orcamentos(id)
    ON DELETE CASCADE;

-- 2.4) tabela_itens_orcamento → tabela_composicoes
--      Composição usada em orçamento não pode ser apagada → RESTRICT
ALTER TABLE tabela_itens_orcamento
    ADD CONSTRAINT tabela_itens_orcamento_composicao_fkey
    FOREIGN KEY (composicao_id)
    REFERENCES tabela_composicoes(id)
    ON DELETE RESTRICT;

-- 3) Índices nas colunas de FK (essencial para performance de JOIN e
--    para o próprio Postgres validar deleções em CASCADE/RESTRICT)
CREATE INDEX IF NOT EXISTS tabela_itens_composicao_composicao_idx
    ON tabela_itens_composicao(composicao_id);

CREATE INDEX IF NOT EXISTS tabela_itens_composicao_insumo_idx
    ON tabela_itens_composicao(insumo_id);

CREATE INDEX IF NOT EXISTS tabela_itens_orcamento_orcamento_idx
    ON tabela_itens_orcamento(orcamento_id);

CREATE INDEX IF NOT EXISTS tabela_itens_orcamento_composicao_idx
    ON tabela_itens_orcamento(composicao_id);
