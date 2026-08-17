-- Valor estimado opcional (orcamento_estrutura.estimado) — override manual
-- usado SÓ no total de "(B) Serviços Estimados" do Caderno/Relatórios, nunca
-- na planilha em si (Total Orçado, Curva ABC, quantidade/custo_unitário do
-- item continuam intocados). Quando NULL, o relatório usa o valor calculado
-- da planilha (comportamento atual, sem mudança). Sempre limpo quando o item
-- é desmarcado como estimado — mesma regra de estimado_motivo.

ALTER TABLE orcamento_estrutura
  ADD COLUMN IF NOT EXISTS valor_estimado NUMERIC;

NOTIFY pgrst, 'reload schema';
