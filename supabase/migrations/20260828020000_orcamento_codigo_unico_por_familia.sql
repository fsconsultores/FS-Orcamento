-- Mais uma regressão da introdução de revisões: tabela_orcamentos_codigo_key
-- exigia "codigo" único em toda a tabela, mas criarRevisao() (duplicate.ts)
-- copia de propósito o mesmo codigo do orçamento de origem — é o mesmo
-- projeto, não um projeto novo (diferente de duplicarOrcamento, que gera
-- "Cópia de X"). Toda 2a revisão em diante colidia com essa constraint.
--
-- Substituída por um índice único parcial que só compara os "âncoras" de
-- cada família (id = grupo_id, sempre a Revisão 1, garantido pela criação em
-- criarRevisao) — impede que dois projetos diferentes usem o mesmo código,
-- sem impedir que revisões da mesma família compartilhem o código do projeto.
alter table tabela_orcamentos drop constraint if exists tabela_orcamentos_codigo_key;

create unique index if not exists idx_tabela_orcamentos_codigo_por_familia
  on tabela_orcamentos(codigo) where id = grupo_id;

NOTIFY pgrst, 'reload schema';
