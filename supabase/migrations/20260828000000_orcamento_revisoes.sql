-- Revisões independentes de orçamento: cada revisão é uma cópia completa e
-- isolada em tabela_orcamentos (mesmo mecanismo que já existia para "criar
-- orçamento a partir de uma versão" — ver origem_orcamento_id/origem_versao_id
-- na migração 20260730000000), agrupada visualmente por grupo_id.
--
-- grupo_id aponta sempre para a Revisão 1 da família (a Revisão 1 aponta pra
-- si mesma) — O(1) para "todas as revisões deste orçamento" sem percorrer a
-- cadeia de origem_orcamento_id. numero_revisao é persistido (1, 2, 3...) em
-- vez de calculado no cliente pela ordem cronológica de orcamento_versoes,
-- como era antes (ver revisaoPorId em versoes-view.tsx).
--
-- ON DELETE RESTRICT (não CASCADE): apagar a Revisão 1 enquanto outras
-- revisões da família ainda existem fica bloqueado — evita que apagar a
-- revisão mais antiga derrube silenciosamente todas as demais. Um orçamento
-- solo (sem outras revisões apontando pra ele) continua livre pra apagar,
-- igual hoje.
-- criado_por_email: mesmo padrão de orcamento_versoes.autor_email — capturado
-- direto do auth.users no momento da criação (auth.users não é consultável
-- via PostgREST pelo usuário comum, então não dá pra fazer join depois).
-- NULL para todo orçamento existente antes desta migração (sem como saber
-- retroativamente quem criou cada um) — a listagem de revisões trata isso
-- mostrando "—" em vez de travar.
alter table tabela_orcamentos
  add column if not exists grupo_id uuid references tabela_orcamentos(id) on delete restrict,
  add column if not exists numero_revisao integer not null default 1 check (numero_revisao > 0),
  add column if not exists criado_por_email text;

-- Backfill: todo orçamento existente vira uma família de 1 revisão, apontando
-- pra si mesmo — aditivo, não move nenhuma linha de conteúdo (orcamento_estrutura,
-- orcamento_composicoes, etc. não são tocadas por esta migração).
update tabela_orcamentos set grupo_id = id where grupo_id is null;

alter table tabela_orcamentos alter column grupo_id set not null;

create unique index if not exists idx_tabela_orcamentos_grupo_revisao
  on tabela_orcamentos(grupo_id, numero_revisao);

create index if not exists idx_tabela_orcamentos_grupo
  on tabela_orcamentos(grupo_id);

NOTIFY pgrst, 'reload schema';
