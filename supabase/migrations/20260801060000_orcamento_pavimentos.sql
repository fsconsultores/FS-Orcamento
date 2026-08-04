-- Detalhamento de área por pavimento (Configurações → Pavimentos), pro
-- Caderno mostrar a tabela "CUSTO / M²" quebrada por pavimento (ex.:
-- "RESTAURANTE E COZINHA - ÁREAS COBERTAS", "PÁTIOS EXTERNOS - ÁREAS
-- DESCOBERTAS"), com uma linha de soma — em vez de só o total único que já
-- existia em tabela_orcamentos.area_total/area_coberta/area_equivalente.
-- Esses 3 campos continuam existindo e servindo de fallback pra orçamentos
-- sem pavimentos cadastrados (nenhuma migração retroativa necessária) — ver
-- getCadernoData em src/lib/orcamento/caderno.ts.
create table if not exists public.orcamento_pavimentos (
  id               uuid         primary key default gen_random_uuid(),
  orcamento_id     uuid         not null references public.tabela_orcamentos(id) on delete cascade,
  descricao        text         not null,
  unidade          text         not null default 'M2',
  area_total       numeric(12,2) not null default 0,
  area_equivalente numeric(12,2) not null default 0,
  area_coberta     numeric(12,2) not null default 0,
  ordem            int          not null default 0,
  created_at       timestamptz  not null default now()
);

create index if not exists idx_orc_pavimentos_orcamento
  on public.orcamento_pavimentos(orcamento_id, ordem);

alter table public.orcamento_pavimentos enable row level security;

create policy orcamento_pavimentos_domain
  on public.orcamento_pavimentos for all to authenticated
  using      (public.is_authorized_domain())
  with check (public.is_authorized_domain());

NOTIFY pgrst, 'reload schema';
