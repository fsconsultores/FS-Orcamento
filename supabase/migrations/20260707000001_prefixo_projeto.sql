-- Corrige o identificador do projeto para ser PREFIXO do código (ex.:
-- ABC-88316), não sufixo (88316-ABC) como na migração anterior
-- (20260707000000_sufixo_projeto.sql). Substitui só o corpo da função —
-- os triggers já criados continuam apontando para ela, nada mais muda.
-- Orçamentos/códigos já existentes não são afetados: o trigger só age em
-- INSERTs novos a partir de agora.

CREATE OR REPLACE FUNCTION _trg_sufixo_projeto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  prefixo TEXT;
BEGIN
  -- Se codigo_original já veio preenchido (cópia de uma versão/duplicação já
  -- resolvida para este projeto), não mexe em nada — evita prefixar duas vezes.
  IF NEW.codigo_original IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT codigo INTO prefixo FROM tabela_orcamentos WHERE id = NEW.orcamento_id;

  IF prefixo IS NOT NULL AND btrim(prefixo) <> '' AND NEW.codigo IS NOT NULL THEN
    NEW.codigo_original := NEW.codigo;
    NEW.codigo := btrim(prefixo) || '-' || NEW.codigo;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
