-- Planilha orçamentária hierárquica com níveis (capítulos, grupos, itens)
CREATE TABLE orcamento_estrutura (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id    UUID          NOT NULL REFERENCES tabela_orcamentos(id) ON DELETE CASCADE,
  parent_id       UUID          REFERENCES orcamento_estrutura(id) ON DELETE CASCADE,
  numero          TEXT          NOT NULL,
  nivel           INTEGER       NOT NULL DEFAULT 1,
  codigo          TEXT,
  descricao       TEXT          NOT NULL,
  unidade         TEXT,
  quantidade      NUMERIC(14,4),
  custo_unitario  NUMERIC(14,4),
  tipo            TEXT          NOT NULL CHECK (tipo IN ('grupo', 'item')),
  ordem           INTEGER       NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   DEFAULT now()
);

CREATE INDEX orcamento_estrutura_orcamento_idx ON orcamento_estrutura(orcamento_id);
CREATE INDEX orcamento_estrutura_parent_idx    ON orcamento_estrutura(parent_id);

ALTER TABLE orcamento_estrutura ENABLE ROW LEVEL SECURITY;

CREATE POLICY orcamento_estrutura_select ON orcamento_estrutura
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM tabela_orcamentos o
    WHERE o.id = orcamento_id AND o.user_id = auth.uid()
  ));

CREATE POLICY orcamento_estrutura_insert ON orcamento_estrutura
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_authorized_domain() AND EXISTS (
      SELECT 1 FROM tabela_orcamentos o
      WHERE o.id = orcamento_id AND o.user_id = auth.uid()
    )
  );

CREATE POLICY orcamento_estrutura_update ON orcamento_estrutura
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

CREATE POLICY orcamento_estrutura_delete ON orcamento_estrutura
  FOR DELETE TO authenticated
  USING (
    public.is_authorized_domain() AND EXISTS (
      SELECT 1 FROM tabela_orcamentos o
      WHERE o.id = orcamento_id AND o.user_id = auth.uid()
    )
  );
