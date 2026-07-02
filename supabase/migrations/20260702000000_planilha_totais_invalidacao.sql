-- Totais persistidos e rastreamento de invalidação por planilha.
-- Permite que relatórios, exportações e APIs usem valores do banco.

ALTER TABLE orcamento_planilhas
  ADD COLUMN IF NOT EXISTS total_custo       NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS total_com_bdi     NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS invalidado_em     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ultima_calculo_em TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
