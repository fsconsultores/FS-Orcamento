-- Persiste o custo_unitario calculado e o timestamp do último cálculo
-- em orcamento_composicoes para viabilizar delta detection no motor de cálculo.
-- Cria a tabela se não existir no banco remoto (compatibilidade).

CREATE TABLE IF NOT EXISTS orcamento_composicoes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES tabela_orcamentos(id) ON DELETE CASCADE,
  codigo       TEXT NOT NULL DEFAULT '',
  descricao    TEXT NOT NULL DEFAULT '',
  unidade      TEXT,
  base         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orcamento_composicoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orcamento_composicoes' AND policyname = 'owner_composicoes'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "owner_composicoes" ON orcamento_composicoes
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

-- Colunas para o motor de cálculo (delta detection)
ALTER TABLE orcamento_composicoes
  ADD COLUMN IF NOT EXISTS custo_unitario NUMERIC(14,4),
  ADD COLUMN IF NOT EXISTS calculado_em   TIMESTAMPTZ;
