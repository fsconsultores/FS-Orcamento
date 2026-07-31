-- Move a marcação "estimado" do nível do item da EAP (orcamento_estrutura,
-- feature anterior) para o nível do insumo (orcamento_insumos). Motivo: uma
-- composição tem vários insumos, e o orçamentista quer marcar QUAL insumo
-- específico dentro dela ainda depende de validação — não a composição/item
-- inteira. As colunas antigas em orcamento_estrutura ficam paradas no banco
-- (não são mais lidas/escritas pelo app), sem migração retroativa — mesmo
-- padrão já usado neste projeto para trocas de mecanismo (ex.: tabela_logs).
ALTER TABLE orcamento_insumos
  ADD COLUMN IF NOT EXISTS estimado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS estimado_motivo TEXT;

NOTIFY pgrst, 'reload schema';
