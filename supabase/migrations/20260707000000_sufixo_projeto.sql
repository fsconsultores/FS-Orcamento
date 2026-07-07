-- Código exclusivo de insumo/composição por projeto: todo código gravado em
-- orcamento_insumos/orcamento_composicoes ganha automaticamente o sufixo do
-- projeto (tabela_orcamentos.codigo), preservando o código original em
-- codigo_original. Aplicado via trigger para cobrir TODOS os pontos de
-- inserção (import de base, import de CSV, criação manual, em lote) sem
-- depender de cada call site no JS lembrar de aplicar o sufixo.

ALTER TABLE orcamento_insumos     ADD COLUMN IF NOT EXISTS codigo_original TEXT;
ALTER TABLE orcamento_composicoes ADD COLUMN IF NOT EXISTS codigo_original TEXT;

CREATE OR REPLACE FUNCTION _trg_sufixo_projeto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  sufixo TEXT;
BEGIN
  -- Se codigo_original já veio preenchido (cópia de uma versão/duplicação já
  -- resolvida para este projeto), não mexe em nada — evita sufixar duas vezes.
  IF NEW.codigo_original IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT codigo INTO sufixo FROM tabela_orcamentos WHERE id = NEW.orcamento_id;

  IF sufixo IS NOT NULL AND btrim(sufixo) <> '' AND NEW.codigo IS NOT NULL THEN
    NEW.codigo_original := NEW.codigo;
    NEW.codigo := NEW.codigo || '-' || btrim(sufixo);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sufixo_projeto_insumo ON orcamento_insumos;
CREATE TRIGGER trg_sufixo_projeto_insumo
  BEFORE INSERT ON orcamento_insumos
  FOR EACH ROW EXECUTE FUNCTION _trg_sufixo_projeto();

DROP TRIGGER IF EXISTS trg_sufixo_projeto_composicao ON orcamento_composicoes;
CREATE TRIGGER trg_sufixo_projeto_composicao
  BEFORE INSERT ON orcamento_composicoes
  FOR EACH ROW EXECUTE FUNCTION _trg_sufixo_projeto();

NOTIFY pgrst, 'reload schema';
