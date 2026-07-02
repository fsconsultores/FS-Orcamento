-- Log de auditoria por projeto.
-- Registra cálculos, importações, exportações, alterações e erros.

CREATE TABLE IF NOT EXISTS orcamento_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID        NOT NULL REFERENCES tabela_orcamentos(id) ON DELETE CASCADE,
  planilha_id  UUID        REFERENCES orcamento_planilhas(id) ON DELETE SET NULL,
  user_id      UUID        REFERENCES auth.users(id),
  acao         TEXT        NOT NULL,
  mensagem     TEXT        NOT NULL,
  detalhes     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orcamento_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orcamento_logs' AND policyname = 'orcamento_logs_owner'
  ) THEN
    CREATE POLICY "orcamento_logs_owner" ON orcamento_logs
      FOR ALL TO authenticated
      USING (
        orcamento_id IN (
          SELECT id FROM tabela_orcamentos WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orcamento_logs_lookup
  ON orcamento_logs(orcamento_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
