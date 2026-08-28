-- Corrige regressão introduzida por 20260828000000_orcamento_revisoes.sql:
-- grupo_id ficou NOT NULL, mas só criarRevisao() (duplicate.ts) preenchia
-- essa coluna no insert. Todo outro caminho que cria uma linha nova em
-- tabela_orcamentos (criar do zero em /orcamentos/novo, duplicarOrcamento,
-- criarOrcamentoAPartirDeModelo, criarOrcamentoDeVersao) não sabia da coluna
-- e passou a falhar com "null value in column grupo_id violates not-null
-- constraint" — inclusive o próprio botão "Nova revisão" quebrava quando o
-- orçamento de origem passava por um desses fluxos depois da primeira
-- migração (ex.: qualquer orçamento criado após ela ser aplicada).
--
-- Em vez de caçar e remendar cada call site (frágil — qualquer novo insert
-- futuro cairia na mesma armadilha), um trigger resolve na raiz: toda linha
-- nova sem grupo_id explícito vira sua própria família (grupo_id = seu
-- próprio id), exatamente a mesma regra já usada no backfill da migração
-- anterior para orçamentos pré-existentes. criarRevisao() continua passando
-- grupo_id explicitamente (o id da Revisão 1 da família) — o trigger só age
-- quando a coluna vem NULL, então não interfere nesse caso.
create or replace function set_tabela_orcamentos_grupo_id_default()
returns trigger as $$
begin
  if new.grupo_id is null then
    new.grupo_id := new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tabela_orcamentos_grupo_id_default on tabela_orcamentos;

create trigger trg_tabela_orcamentos_grupo_id_default
  before insert on tabela_orcamentos
  for each row
  execute function set_tabela_orcamentos_grupo_id_default();

NOTIFY pgrst, 'reload schema';
