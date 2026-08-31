-- Categoria de insumo — nível "família/tipo" acima de orcamento_insumos (o
-- insumo específico da obra) e orcamento_insumo_cotacoes (o preço/cotação),
-- que já existiam. Objetivo: permitir comparar "Abajur" entre obras mesmo
-- quando cada obra usa um produto diferente (Abajur 2m verde ≠ Abajur
-- pendente dourado), sem forçar que sejam o mesmo item — e sem exigir que o
-- futuro módulo de Acompanhamento de Obras seja quem cria essas categorias
-- (ver análise "Categorias de Insumos", 31/08/2026).
--
-- TEXT, não uma tabela nova com FK: em NENHUM ponto desta arquitetura um
-- orçamento referencia uma linha viva fora de si mesmo (Base Global é
-- sempre copiada, nunca referenciada — ver base_id/codigo em
-- orcamento_insumos). Uma tabela categorias_insumo(id, nome) reintroduziria
-- exatamente esse acoplamento pela primeira vez no sistema, para resolver um
-- problema (erro de digitação, rename em massa) que um combobox com
-- autocomplete já resolve na prática — ver listarCategoriasUsadas em
-- categorias-insumo.ts, que funde variantes de escrita (maiúscula/acento/
-- espaço) em memória, sem precisar de tabela nem de extensão unaccent no
-- Postgres.
--
-- categoria em tabela_insumos (Base Global) também, pelo mesmo motivo que
-- descricao/unidade/preco_base já existem lá: se um dia a Base Global for
-- taggeada, o import (importarDaBase, import-action.ts) já carrega a
-- categoria junto pro orçamento, como qualquer outro campo copiado.
alter table tabela_insumos
  add column if not exists categoria text;

alter table orcamento_insumos
  add column if not exists categoria text;

-- Índice funcional case/espaço-insensitive — cobre a maioria dos casos reais
-- de digitação inconsistente (Abajur / ABAJUR / abajur) direto no banco.
-- Acento (Luminária vs Luminaria) e sinônimo (Abajur vs Luminária) são
-- fundidos em memória por listarCategoriasUsadas, não aqui.
create index if not exists idx_orcamento_insumos_categoria
  on orcamento_insumos (lower(btrim(categoria)));

-- Alimenta o combobox "Categoria" (pesquisar / selecionar / ver já usadas) —
-- agrega no banco por texto exato (poucas linhas: uma por variante de
-- categoria já digitada, não uma por insumo) para o merge de variantes de
-- escrita em JS (listarCategoriasUsadas) processar pouco dado, mesmo com o
-- catálogo de insumos crescendo por anos. Mesmo padrão de view de resumo já
-- usado neste projeto (vw_bases_resumo, vw_total_orcamento, etc.) — RLS de
-- orcamento_insumos (por domínio, não por usuário) já se aplica através da
-- view automaticamente, sem política nova.
create or replace view vw_categorias_insumo as
select categoria, count(*)::int as usos
from orcamento_insumos
where categoria is not null
  and btrim(categoria) <> ''
  and deleted_at is null
group by categoria;

NOTIFY pgrst, 'reload schema';
