create table if not exists public.tabela_historico_precos (
  id             uuid         primary key default gen_random_uuid(),
  insumo_id      uuid         not null references public.tabela_insumos(id) on delete cascade,
  preco_anterior numeric(14,4),
  preco_novo     numeric(14,4) not null,
  origem         text         not null,
  observacao     text,
  usuario        text,
  created_at     timestamptz  not null default now()
);

create index if not exists idx_historico_precos_insumo_id
  on public.tabela_historico_precos(insumo_id);
create index if not exists idx_historico_precos_created_at
  on public.tabela_historico_precos(created_at desc);

alter table public.tabela_historico_precos enable row level security;

create policy "authenticated select historico"
  on public.tabela_historico_precos for select to authenticated using (true);

create policy "authenticated insert historico"
  on public.tabela_historico_precos for insert to authenticated with check (true);
