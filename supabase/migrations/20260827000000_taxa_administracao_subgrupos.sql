-- Taxa de Administração deixa de ser um único percentual flat e passa a
-- suportar múltiplos subgrupos nomeados (ex.: "12% sobre custos diretos",
-- "6% sobre contratações"), configurados em Configurações. Cada subgrupo vira
-- um item-filho de um GRUPO "Taxa de Administração" na planilha (em vez de um
-- item único de nível raiz) — soma automática pela árvore já existente
-- (calcTotais em planilha-tree.ts). Todos os subgrupos aplicam o percentual
-- sobre a MESMA base: soma dos demais itens do projeto, excluindo os próprios
-- itens de taxa — ver src/lib/orcamento/modelo-acrescimo.ts.
create table if not exists public.orcamento_taxa_administracao_itens (
  id           uuid         primary key default gen_random_uuid(),
  orcamento_id uuid         not null references public.tabela_orcamentos(id) on delete cascade,
  descricao    text         not null,
  percentual   numeric(7,4) not null default 0 check (percentual >= 0),
  ordem        int          not null default 0,
  created_at   timestamptz  not null default now()
);

create index if not exists idx_orc_taxa_administracao_itens_orcamento
  on public.orcamento_taxa_administracao_itens(orcamento_id, ordem);

alter table public.orcamento_taxa_administracao_itens enable row level security;

create policy orcamento_taxa_administracao_itens_domain
  on public.orcamento_taxa_administracao_itens for all to authenticated
  using      (public.is_authorized_domain())
  with check (public.is_authorized_domain());

-- Backfill: orçamentos já configurados com o percentual flat (antes de
-- existirem subgrupos) ganham 1 subgrupo equivalente — preserva o total já
-- calculado sem exigir reconfiguração manual. tabela_orcamentos.
-- taxa_administracao_percentual continua na tabela (não é destrutivo
-- removê-la agora), mas deixa de ser lida/escrita pelo código a partir desta
-- migração — a lista de subgrupos é que manda.
insert into public.orcamento_taxa_administracao_itens (orcamento_id, descricao, percentual, ordem)
select id, 'Taxa de Administração', taxa_administracao_percentual, 0
from public.tabela_orcamentos
where modelo_acrescimo = 'taxa_administracao'
  and taxa_administracao_percentual > 0;

-- O item auto-gerenciado único vira um GRUPO com N filhos (1 por subgrupo) —
-- o índice antigo (no máximo 1 linha flagada por planilha) precisa passar a
-- permitir múltiplas linhas flagadas (o grupo + seus filhos), restrito agora
-- a garantir no máximo 1 GRUPO "Taxa de Administração" por planilha.
drop index if exists idx_orcamento_estrutura_taxa_administracao_unica;

create unique index if not exists idx_orcamento_estrutura_taxa_administracao_grupo_unico
  on public.orcamento_estrutura(planilha_id) where (eh_taxa_administracao and tipo = 'grupo');

-- Remove o(s) item(ns) auto-gerenciado(s) do design anterior (um único ITEM
-- flagado, sem grupo) — o subgrupo equivalente já foi migrado acima, e o
-- próximo recálculo (persistirTotaisPlanilha) recria a estrutura nova
-- (GRUPO + filhos) a partir dele automaticamente. Sem esta limpeza esse item
-- órfão continuaria de pé como um item comum de tipo 'item', contando como
-- "custo normal" na soma que alimenta o novo grupo — duplicando o valor que
-- ele mesmo representava.
delete from public.orcamento_estrutura
where eh_taxa_administracao = true and tipo = 'item';

NOTIFY pgrst, 'reload schema';
