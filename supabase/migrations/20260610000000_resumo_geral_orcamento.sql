-- Áreas para cálculo de custo/m² no Resumo Geral do Orçamento (caderno)
ALTER TABLE tabela_orcamentos
  ADD COLUMN IF NOT EXISTS area_total NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS area_coberta NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS area_equivalente NUMERIC(14,2);

-- Lista de serviços estimados (não orçados na planilha, mas previstos no caderno)
CREATE TABLE orcamento_servicos_estimados (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID          NOT NULL REFERENCES tabela_orcamentos(id) ON DELETE CASCADE,
  descricao    TEXT          NOT NULL,
  valor        NUMERIC(14,2) NOT NULL DEFAULT 0,
  ordem        INTEGER       NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX orcamento_servicos_estimados_orcamento_idx ON orcamento_servicos_estimados(orcamento_id);

ALTER TABLE orcamento_servicos_estimados ENABLE ROW LEVEL SECURITY;

CREATE POLICY orcamento_servicos_estimados_select ON orcamento_servicos_estimados
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tabela_orcamentos o
    WHERE o.id = orcamento_id AND o.user_id = auth.uid()
  ));

CREATE POLICY orcamento_servicos_estimados_insert ON orcamento_servicos_estimados
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_authorized_domain() AND EXISTS (
      SELECT 1 FROM tabela_orcamentos o
      WHERE o.id = orcamento_id AND o.user_id = auth.uid()
    )
  );

CREATE POLICY orcamento_servicos_estimados_update ON orcamento_servicos_estimados
  FOR UPDATE TO authenticated
  USING (
    public.is_authorized_domain() AND EXISTS (
      SELECT 1 FROM tabela_orcamentos o
      WHERE o.id = orcamento_id AND o.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_authorized_domain() AND EXISTS (
      SELECT 1 FROM tabela_orcamentos o
      WHERE o.id = orcamento_id AND o.user_id = auth.uid()
    )
  );

CREATE POLICY orcamento_servicos_estimados_delete ON orcamento_servicos_estimados
  FOR DELETE TO authenticated
  USING (
    public.is_authorized_domain() AND EXISTS (
      SELECT 1 FROM tabela_orcamentos o
      WHERE o.id = orcamento_id AND o.user_id = auth.uid()
    )
  );
