-- Histórico de Alterações / Auditoria unificada: substitui tabela_logs (log
-- geral do sistema) e orcamento_logs (log do motor de cálculo) por uma única
-- tabela, com valor_anterior/valor_novo estruturados para ações de edição
-- escalar (preço de insumo, campos de configuração) e detalhes livres para
-- os demais casos (contagens agregadas, arrays de linhas apagadas p/ restore).
--
-- Sem migração retroativa: tabela_logs e orcamento_logs continuam existindo
-- no banco (não são apagadas), só param de receber registros novos.

CREATE TABLE historico_alteracoes (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  orcamento_id   UUID        REFERENCES tabela_orcamentos(id) ON DELETE CASCADE, -- NULL = evento global (sem projeto)
  planilha_id    UUID        REFERENCES orcamento_planilhas(id) ON DELETE SET NULL,
  user_id        UUID        REFERENCES auth.users(id),
  usuario_email  TEXT,
  tipo           TEXT        NOT NULL DEFAULT 'info' CHECK (tipo IN ('info','sucesso','erro')),
  acao           TEXT        NOT NULL,
  entidade       TEXT,
  mensagem       TEXT        NOT NULL,
  valor_anterior JSONB,
  valor_novo     JSONB,
  detalhes       JSONB
);

CREATE INDEX idx_historico_orcamento ON historico_alteracoes(orcamento_id, created_at DESC);
CREATE INDEX idx_historico_acao      ON historico_alteracoes(acao);
CREATE INDEX idx_historico_entidade  ON historico_alteracoes(entidade);

ALTER TABLE historico_alteracoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historico_select" ON historico_alteracoes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "historico_insert" ON historico_alteracoes
  FOR INSERT TO authenticated WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
