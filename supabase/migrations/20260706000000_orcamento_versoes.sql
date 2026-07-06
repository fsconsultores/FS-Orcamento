-- Versionamento (commits) de orçamentos: snapshot completo e imutável do
-- estado do orçamento em um instante, para histórico/restauração.
-- Nunca apagado automaticamente (sem pruning/expiração).

CREATE TABLE IF NOT EXISTS orcamento_versoes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id  UUID        NOT NULL REFERENCES tabela_orcamentos(id) ON DELETE CASCADE,
  mensagem      TEXT        NOT NULL CHECK (length(trim(mensagem)) > 0),
  user_id       UUID        REFERENCES auth.users(id),
  autor_email   TEXT,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  snapshot      JSONB       NOT NULL,
  schema_versao INTEGER     NOT NULL DEFAULT 1,
  restaurado_de UUID        REFERENCES orcamento_versoes(id),
  origem        TEXT        NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'pre_restore'))
);

CREATE INDEX IF NOT EXISTS idx_orcamento_versoes_lookup
  ON orcamento_versoes(orcamento_id, criado_em DESC);

ALTER TABLE orcamento_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orcamento_versoes_owner" ON orcamento_versoes
  FOR ALL TO authenticated
  USING (
    orcamento_id IN (SELECT id FROM tabela_orcamentos WHERE user_id = auth.uid())
  )
  WITH CHECK (
    orcamento_id IN (SELECT id FROM tabela_orcamentos WHERE user_id = auth.uid())
  );

-- Nunca apagar versões automaticamente: nenhuma lógica de expiração/pruning
-- deve ser adicionada a esta tabela.

NOTIFY pgrst, 'reload schema';
