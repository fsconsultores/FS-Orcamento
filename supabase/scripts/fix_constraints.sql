-- =====================================================================
-- FIX: remove constraints antigos que estão colidindo e recria
-- com nomes prefixados pela tabela (convenção PostgreSQL).
-- Idempotente. Pode rodar quantas vezes quiser.
-- =====================================================================

-- 1) Remover constraints antigos com nomes "globais" (de execuções anteriores)
DO $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN
        SELECT con.conname AS cname, c.relname AS tname
        FROM pg_constraint con
        JOIN pg_class c     ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND con.conname IN (
              'uq_insumo_codigo',
              'uq_composicao_codigo',
              'uq_item_composicao'
          )
    LOOP
        RAISE NOTICE 'Removendo constraint % da tabela %', rec.cname, rec.tname;
        EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', rec.tname, rec.cname);
    END LOOP;
END $$;

-- 2) Garantir que os UNIQUE corretos existam, com nomes prefixados pela tabela.
--    Usa DO block + verificação no information_schema para não tentar criar duas vezes.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tabela_insumos_codigo_key'
    ) THEN
        ALTER TABLE tabela_insumos
            ADD CONSTRAINT tabela_insumos_codigo_key UNIQUE (codigo);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tabela_composicoes_codigo_key'
    ) THEN
        ALTER TABLE tabela_composicoes
            ADD CONSTRAINT tabela_composicoes_codigo_key UNIQUE (codigo);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tabela_itens_composicao_par_key'
    ) THEN
        ALTER TABLE tabela_itens_composicao
            ADD CONSTRAINT tabela_itens_composicao_par_key UNIQUE (composicao_id, insumo_id);
    END IF;
END $$;
