-- Motivo opcional do "Item estimado" (orcamento_estrutura.estimado) — texto
-- livre (a tela oferece opções pré-definidas + "Outro", mas o banco só guarda
-- o texto final, sem enum: evita acoplar o schema a uma lista que muda por
-- gosto de UX). Sempre limpo quando o item é desmarcado como estimado.

ALTER TABLE orcamento_estrutura
  ADD COLUMN IF NOT EXISTS estimado_motivo TEXT;

NOTIFY pgrst, 'reload schema';
