CREATE TABLE IF NOT EXISTS tabela_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  empresa TEXT NOT NULL,
  usuario TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('info', 'sucesso', 'erro')),
  acao TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  contexto JSONB
);

ALTER TABLE tabela_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logs_select" ON tabela_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "logs_insert" ON tabela_logs
  FOR INSERT TO authenticated WITH CHECK (true);
