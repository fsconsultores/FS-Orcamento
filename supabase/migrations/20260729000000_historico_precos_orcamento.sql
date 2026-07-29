-- Histórico de preço de insumo por orçamento — mesmo padrão de
-- tabela_historico_precos (biblioteca global), mas chaveado por
-- (orcamento_id, codigo) em vez de insumo_id: o avulso de um orçamento
-- (orcamento_insumos, composicao_id IS NULL) pode ser apagado e recriado
-- (handleClear, reimportação de base), então usar o código em vez do id da
-- linha garante que o histórico não fica órfão.
--
-- Só edição manual de preço grava aqui (aba Insumos do orçamento, e o botão
-- "atualizar preço" usado na Curva ABC/Planilha analítica) — reimportação em
-- massa de base (SINAPI/DNIT/cotação) não gera entradas de propósito, senão
-- geraria milhares de linhas idênticas a cada reimportação.
create table if not exists public.orcamento_insumo_historico_precos (
  id             uuid         primary key default gen_random_uuid(),
  orcamento_id   uuid         not null references public.tabela_orcamentos(id) on delete cascade,
  codigo         text         not null,
  preco_anterior numeric(14,4),
  preco_novo     numeric(14,4) not null,
  usuario        text,
  created_at     timestamptz  not null default now()
);

create index if not exists idx_orc_historico_precos_orcamento_codigo
  on public.orcamento_insumo_historico_precos(orcamento_id, codigo);
create index if not exists idx_orc_historico_precos_created_at
  on public.orcamento_insumo_historico_precos(created_at desc);

alter table public.orcamento_insumo_historico_precos enable row level security;

-- Mesmo padrão de domínio aberto já usado pra tudo que é orçamento
-- (20260724000000_orcamentos_visiveis_dominio.sql)
create policy orcamento_insumo_historico_precos_domain
  on public.orcamento_insumo_historico_precos for all to authenticated
  using      (public.is_authorized_domain())
  with check (public.is_authorized_domain());

NOTIFY pgrst, 'reload schema';
