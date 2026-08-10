-- Módulo de Levantamentos (MVP): controla o processo de "o que existe na
-- obra e quanto" separado da precificação (orcamento_composicoes/insumos) —
-- ver processo descrito pelo usuário. 3 tabelas:
-- orcamento_levantamentos (uma por área/disciplina, ex.: "Arquitetura"),
-- orcamento_levantamento_itens (checklist dentro de cada área) e
-- orcamento_levantamento_pendencias (dúvidas levantadas durante o
-- levantamento, ligadas à área). Quantitativo (quantidade+unidade por item)
-- e a ligação com composição/preço ficam para uma fase futura — MVP é só
-- status + checklist binário (concluído/não).

create table if not exists public.orcamento_levantamentos (
  id             uuid         primary key default gen_random_uuid(),
  orcamento_id   uuid         not null references public.tabela_orcamentos(id) on delete cascade,
  nome           text         not null,
  responsavel    text,
  status         text         not null default 'nao_iniciado'
                   check (status in ('nao_iniciado','em_andamento','concluido','com_pendencia','bloqueado')),
  data_inicio    date,
  data_prazo     date,
  ordem          int          not null default 0,
  created_at     timestamptz  not null default now()
);

create index if not exists idx_orc_levantamentos_orcamento
  on public.orcamento_levantamentos(orcamento_id, ordem);

alter table public.orcamento_levantamentos enable row level security;

create policy orcamento_levantamentos_domain
  on public.orcamento_levantamentos for all to authenticated
  using      (public.is_authorized_domain())
  with check (public.is_authorized_domain());

-- Checklist dentro de cada área — progresso é sempre calculado
-- (concluidos/total), sem coluna própria de percentual.
create table if not exists public.orcamento_levantamento_itens (
  id               uuid         primary key default gen_random_uuid(),
  levantamento_id  uuid         not null references public.orcamento_levantamentos(id) on delete cascade,
  descricao        text         not null,
  concluido        boolean      not null default false,
  ordem            int          not null default 0,
  created_at       timestamptz  not null default now()
);

create index if not exists idx_orc_levantamento_itens_levantamento
  on public.orcamento_levantamento_itens(levantamento_id, ordem);

alter table public.orcamento_levantamento_itens enable row level security;

create policy orcamento_levantamento_itens_domain
  on public.orcamento_levantamento_itens for all to authenticated
  using      (public.is_authorized_domain())
  with check (public.is_authorized_domain());

-- Pendências encontradas durante o levantamento (ex.: material da fachada
-- não especificado) — ligadas à área, não a um item específico do checklist
-- (o "item" aqui é só um rótulo livre de contexto, ex.: "Fachada").
create table if not exists public.orcamento_levantamento_pendencias (
  id               uuid         primary key default gen_random_uuid(),
  levantamento_id  uuid         not null references public.orcamento_levantamentos(id) on delete cascade,
  item             text,
  problema         text         not null,
  pergunta         text,
  status           text         not null default 'aberta' check (status in ('aberta','resolvida')),
  usuario          text,
  resolvida_em     timestamptz,
  created_at       timestamptz  not null default now()
);

create index if not exists idx_orc_levantamento_pendencias_levantamento
  on public.orcamento_levantamento_pendencias(levantamento_id);
create index if not exists idx_orc_levantamento_pendencias_abertas
  on public.orcamento_levantamento_pendencias(levantamento_id) where status = 'aberta';

alter table public.orcamento_levantamento_pendencias enable row level security;

create policy orcamento_levantamento_pendencias_domain
  on public.orcamento_levantamento_pendencias for all to authenticated
  using      (public.is_authorized_domain())
  with check (public.is_authorized_domain());

NOTIFY pgrst, 'reload schema';
