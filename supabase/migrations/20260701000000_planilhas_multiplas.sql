-- Suporte a múltiplas planilhas por orçamento.
-- Cada planilha tem seus próprios itens, BDI e estrutura hierárquica.
-- Todas as planilhas compartilham os insumos e composições do orçamento.

CREATE TABLE IF NOT EXISTS orcamento_planilhas (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID       NOT NULL REFERENCES tabela_orcamentos(id) ON DELETE CASCADE,
  nome        TEXT        NOT NULL DEFAULT 'Planilha Principal',
  bdi_global  NUMERIC(7,4) NOT NULL DEFAULT 0,
  ordem       INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     UUID        NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id)
);

ALTER TABLE orcamento_planilhas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planilhas_owner"
  ON orcamento_planilhas FOR ALL TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Cria a tabela orcamento_estrutura caso ainda não exista no banco remoto.
-- (Pode ter sido criada via migration anterior ou via dashboard SQL.)
CREATE TABLE IF NOT EXISTS orcamento_estrutura (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id    UUID        NOT NULL REFERENCES tabela_orcamentos(id) ON DELETE CASCADE,
  parent_id       UUID        REFERENCES orcamento_estrutura(id) ON DELETE CASCADE,
  numero          TEXT,
  nivel           INTEGER     NOT NULL DEFAULT 1,
  codigo          TEXT,
  descricao       TEXT        NOT NULL DEFAULT '',
  unidade         TEXT,
  quantidade      NUMERIC(14,6),
  custo_unitario  NUMERIC(14,4),
  bdi_especifico  NUMERIC(7,4),
  tipo            TEXT        NOT NULL DEFAULT 'item' CHECK (tipo IN ('grupo','item')),
  ordem           INTEGER     NOT NULL DEFAULT 0
);

-- Vincula cada item da planilha a uma planilha específica (nullable para compat.)
ALTER TABLE orcamento_estrutura
  ADD COLUMN IF NOT EXISTS planilha_id UUID REFERENCES orcamento_planilhas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_estrutura_planilha_id
  ON orcamento_estrutura(planilha_id);

-- RLS da estrutura (idempotente — recria apenas se não existir)
ALTER TABLE orcamento_estrutura ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orcamento_estrutura' AND policyname = 'owner_estrutura'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "owner_estrutura" ON orcamento_estrutura
        FOR ALL TO authenticated
        USING (
          orcamento_id IN (
            SELECT id FROM tabela_orcamentos WHERE user_id = auth.uid()
          )
        )
        WITH CHECK (
          orcamento_id IN (
            SELECT id FROM tabela_orcamentos WHERE user_id = auth.uid()
          )
        )
    $pol$;
  END IF;
END $$;
