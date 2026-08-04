-- Ao lançar um preço, o histórico (orcamento_insumo_historico_precos) passa
-- a guardar também fornecedor/data da cotação/observações, quando
-- informados — hoje só o par (preco_anterior, preco_novo) é gravado, então
-- o gráfico/lista de "Histórico de preço" (aba Insumos) não mostra de onde
-- veio aquele preço, só a variação. Mesmos campos já existentes em
-- orcamento_insumo_cotacoes (20260731000000), aqui só como snapshot no
-- histórico de variação — não substitui a tabela de cotações.
ALTER TABLE orcamento_insumo_historico_precos
  ADD COLUMN IF NOT EXISTS fornecedor TEXT,
  ADD COLUMN IF NOT EXISTS data_cotacao DATE,
  ADD COLUMN IF NOT EXISTS observacoes TEXT;

NOTIFY pgrst, 'reload schema';
