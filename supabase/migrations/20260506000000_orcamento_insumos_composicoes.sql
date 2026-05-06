-- Insumos e composições próprias de cada orçamento
-- Dados isolados por orcamento_id — nunca compartilhados entre orçamentos

CREATE TABLE IF NOT EXISTS orcamento_insumos (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id  uuid          NOT NULL REFERENCES tabela_orcamentos(id) ON DELETE CASCADE,
  codigo        text          NOT NULL,
  descricao     text          NOT NULL,
  unidade       text          NOT NULL,
  custo         numeric(15,4) NOT NULL DEFAULT 0,
  grupo         text,
  base          text,
  data_ref      text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orcamento_composicoes (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id  uuid          NOT NULL REFERENCES tabela_orcamentos(id) ON DELETE CASCADE,
  codigo        text          NOT NULL,
  descricao     text          NOT NULL,
  unidade       text          NOT NULL,
  base          text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

-- Índices para performance nas buscas por orçamento
CREATE INDEX orcamento_insumos_orcamento_id_idx
  ON orcamento_insumos(orcamento_id);

CREATE INDEX orcamento_composicoes_orcamento_id_idx
  ON orcamento_composicoes(orcamento_id);

-- RLS: cada tabela isolada pelo dono do orçamento
ALTER TABLE orcamento_insumos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamento_composicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orcamento_insumos: somente dono do orcamento"
  ON orcamento_insumos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tabela_orcamentos o
      WHERE o.id = orcamento_id
        AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "orcamento_composicoes: somente dono do orcamento"
  ON orcamento_composicoes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tabela_orcamentos o
      WHERE o.id = orcamento_id
        AND o.user_id = auth.uid()
    )
  );
