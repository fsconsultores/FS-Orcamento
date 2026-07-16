-- Fase 2 de performance: índices para os padrões de consulta reais do app
-- (auditados em src/lib/orcamento/*.ts e nas páginas de orcamentos/[id]/*).
-- Todos idempotentes (IF NOT EXISTS) — seguros para rodar em banco já em uso.

-- 1. orcamento_estrutura: a query mais quente do sistema (abertura da Planilha)
--    filtra por planilha_id e ordena por (nivel, ordem). Hoje só existem
--    índices de coluna única (orcamento_id, parent_id, planilha_id), então o
--    Postgres faz index scan + sort separado. Este índice composto cobre o
--    WHERE + ORDER BY exatos de planilha/page.tsx, eliminando o sort.
CREATE INDEX IF NOT EXISTS idx_orcamento_estrutura_planilha_nivel_ordem
  ON orcamento_estrutura(planilha_id, nivel, ordem);

-- 2. orcamento_estrutura: filtro (orcamento_id, tipo='item') usado em
--    insumos/composicoes/curva-abc (calcularCodigosUtilizados) e em
--    detectarOrfaos (motor-calculo.ts).
CREATE INDEX IF NOT EXISTS idx_orcamento_estrutura_orcamento_tipo
  ON orcamento_estrutura(orcamento_id, tipo);

-- 3. orcamento_insumos: buscas por código dentro do orçamento — usado em
--    upsertAvulsoInsumo (edição de preço, roda a cada save), no motor de
--    cálculo (avulsoPrecos, .in('codigo', [...])) e na duplicação de
--    orçamento. Hoje só há índice em orcamento_id isolado.
CREATE INDEX IF NOT EXISTS idx_orcamento_insumos_orcamento_codigo
  ON orcamento_insumos(orcamento_id, codigo);

-- 4. orcamento_composicoes: mesma lógica — motor-calculo (subPrecos,
--    .in('codigo', [...])), detectarOrfaos e duplicate.ts.
CREATE INDEX IF NOT EXISTS idx_orcamento_composicoes_orcamento_codigo
  ON orcamento_composicoes(orcamento_id, codigo);

-- 5. orcamento_planilhas: getPlanilhasByOrcamento roda em toda navegação
--    entre abas (filtra orcamento_id, ordena por ordem). Tabela pequena, mas
--    a query roda com frequência muito alta.
CREATE INDEX IF NOT EXISTS idx_orcamento_planilhas_orcamento_ordem
  ON orcamento_planilhas(orcamento_id, ordem);
