-- Gestão de cotações dos insumos do orçamento: cada preço informado
-- manualmente passa a poder carregar fornecedor/data/observações, e cada
-- edição vira uma linha nova aqui (nunca UPDATE em cima da cotação anterior)
-- — igual ao espírito de orcamento_versoes, mas por insumo. Chaveado por
-- (orcamento_id, codigo), mesmo padrão de orcamento_insumo_historico_precos:
-- o avulso (orcamento_insumos, composicao_id IS NULL) pode ser apagado e
-- recriado (handleClear, reimportação de base), então usar o código em vez
-- do id da linha garante que a cotação não fica órfã.
--
-- `ativa` marca qual cotação está em vigor (a que alimenta orcamento_insumos
-- hoje) — não tem constraint UNIQUE forçando "só uma ativa por insumo" de
-- propósito: essa invariante é mantida pela aplicação (upsertAvulsoInsumo
-- desativa a anterior antes de inserir a nova), e não travar no banco deixa
-- espaço pra features futuras de múltiplas cotações concorrentes sem
-- precisar remover a constraint depois. Sem campo de validade/rank/comparação
-- ainda — a tabela já é a base pra isso: histórico completo de cotações por
-- insumo, com fornecedor e data, é exatamente o que "histórico por
-- fornecedor", "comparação entre fornecedores" e "ranking de fornecedores"
-- precisam consultar (GROUP BY fornecedor), sem alterar o schema.
create table if not exists public.orcamento_insumo_cotacoes (
  id             uuid         primary key default gen_random_uuid(),
  orcamento_id   uuid         not null references public.tabela_orcamentos(id) on delete cascade,
  codigo         text         not null,
  valor          numeric      not null,
  fornecedor     text,
  data_cotacao   date,
  observacoes    text,
  ativa          boolean      not null default true,
  usuario        text,
  user_id        uuid         references auth.users(id),
  created_at     timestamptz  not null default now(),
  deleted_at     timestamptz,
  deleted_by     uuid         references auth.users(id)
);

create index if not exists idx_orc_insumo_cotacoes_orcamento_codigo
  on public.orcamento_insumo_cotacoes(orcamento_id, codigo, created_at desc);
create index if not exists idx_orc_insumo_cotacoes_ativa
  on public.orcamento_insumo_cotacoes(orcamento_id, codigo) where ativa;
create index if not exists idx_orc_insumo_cotacoes_fornecedor
  on public.orcamento_insumo_cotacoes(orcamento_id, fornecedor) where fornecedor is not null;

alter table public.orcamento_insumo_cotacoes enable row level security;

create policy orcamento_insumo_cotacoes_domain
  on public.orcamento_insumo_cotacoes for all to authenticated
  using      (public.is_authorized_domain())
  with check (public.is_authorized_domain());

-- Snapshot da cotação ativa direto em orcamento_insumos — evita join na
-- carga normal da aba Insumos (que já faz `select('*')`): fornecedor/data
-- chegam de graça, sem consulta nova. cotacao_id aponta pra linha ativa em
-- orcamento_insumo_cotacoes (facilita "trocar qual cotação está em uso" no
-- futuro: só repontar essa FK e re-copiar os campos, sem migração).
alter table public.orcamento_insumos
  add column if not exists fornecedor text,
  add column if not exists data_cotacao date,
  add column if not exists cotacao_observacoes text,
  add column if not exists cotacao_id uuid references public.orcamento_insumo_cotacoes(id) on delete set null;

NOTIFY pgrst, 'reload schema';
