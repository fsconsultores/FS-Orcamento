-- Rastreia quando o custo de cada insumo foi atualizado pela última vez.

ALTER TABLE orcamento_insumos
  ADD COLUMN IF NOT EXISTS custo_atualizado_em timestamptz;

-- Insumos existentes: usa created_at como valor inicial
UPDATE orcamento_insumos
  SET custo_atualizado_em = created_at
  WHERE custo_atualizado_em IS NULL;

-- Trigger: atualiza o campo automaticamente sempre que custo mudar
CREATE OR REPLACE FUNCTION _trg_custo_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.custo IS DISTINCT FROM OLD.custo THEN
    NEW.custo_atualizado_em := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_custo_atualizado_em ON orcamento_insumos;

CREATE TRIGGER trg_custo_atualizado_em
  BEFORE UPDATE ON orcamento_insumos
  FOR EACH ROW
  EXECUTE FUNCTION _trg_custo_atualizado_em();
