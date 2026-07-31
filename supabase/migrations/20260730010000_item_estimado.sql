-- Marca manual "Item estimado" por item da planilha (orcamento_estrutura),
-- usada pela seção "Itens Estimados" do Resumo do Orçamento. Não afeta
-- nenhum total/cálculo — só é lida na geração do relatório (getCadernoData).
-- Independente do mecanismo já existente de sufixo "- Estimado" no nome
-- (que move o item para "Serviços Estimados (B)", fora do Total Orçado).

ALTER TABLE orcamento_estrutura
  ADD COLUMN IF NOT EXISTS estimado BOOLEAN NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
