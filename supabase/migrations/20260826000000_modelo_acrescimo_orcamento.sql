-- Modelo de acréscimo do orçamento: substitui o BDI como único mecanismo
-- possível por uma escolha explícita entre três modos mutuamente exclusivos.
-- 'bdi' preserva o comportamento de todo orçamento existente (já usam BDI
-- efetivamente, sem precisar de backfill manual — ADD COLUMN...DEFAULT já
-- popula as linhas existentes). 'sem_taxa' resulta em bdi_global=0 em toda
-- planilha (a fórmula de cálculo não muda em nenhum lugar, só o valor que
-- alimenta ela). 'taxa_administracao' também zera o BDI, mas além disso
-- mantém um item "Taxa de Administração" na planilha, recalculado automati-
-- camente como taxa_administracao_percentual% do custo dos demais itens —
-- ver src/lib/orcamento/modelo-acrescimo.ts.

ALTER TABLE tabela_orcamentos
  ADD COLUMN IF NOT EXISTS modelo_acrescimo TEXT NOT NULL DEFAULT 'bdi'
    CHECK (modelo_acrescimo IN ('sem_taxa', 'taxa_administracao', 'bdi')),
  ADD COLUMN IF NOT EXISTS taxa_administracao_percentual NUMERIC(7,4) NOT NULL DEFAULT 0
    CHECK (taxa_administracao_percentual >= 0);

-- Marca qual item de orcamento_estrutura é o item "Taxa de Administração"
-- auto-gerenciado de cada planilha (no modelo 'taxa_administracao', seu
-- custo_unitario é recalculado a cada mudança nos demais itens — nunca
-- editado manualmente enquanto a flag estiver true). O índice único garante
-- no máximo 1 por planilha, evitando duplicação se a lógica de criação for
-- chamada mais de uma vez para a mesma planilha.
ALTER TABLE orcamento_estrutura
  ADD COLUMN IF NOT EXISTS eh_taxa_administracao BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orcamento_estrutura_taxa_administracao_unica
  ON orcamento_estrutura(planilha_id) WHERE eh_taxa_administracao;

NOTIFY pgrst, 'reload schema';
