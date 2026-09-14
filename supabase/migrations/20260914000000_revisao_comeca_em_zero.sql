-- Numeração de revisões passa a começar em 0 (convenção interna da FS: "Rev.
-- 00" é a emissão original, "Rev. 01" a primeira revisão, e assim por
-- diante) — antes começava em 1. Pedido explícito do usuário em 2026-09-14,
-- incluindo renumerar as famílias já existentes, não só as futuras.
--
-- O índice único (grupo_id, numero_revisao) precisa cair ANTES do shift em
-- massa: um UPDATE que desloca todas as linhas por -1 processa linha a
-- linha, e o constraint immediate (não-deferred) checaria uma colisão
-- transitória real sempre que duas revisões consecutivas da mesma família
-- forem atualizadas fora de ordem (ex.: revisão 2→1 processada antes da
-- revisão 1→0 colide, mesmo que o resultado final seja único). Recriado no
-- final.
drop index if exists idx_tabela_orcamentos_grupo_revisao;

-- O CHECK antigo (numero_revisao > 0) bloquearia o UPDATE abaixo assim que
-- a primeira linha da família virasse 0 — precisa cair antes. Busca o nome
-- real do constraint em vez de assumir um nome fixo (nunca rodei esta
-- migration neste banco pra confirmar).
do $$
declare
  con record;
begin
  for con in
    select pgc.conname
    from pg_constraint pgc
    join pg_class rel on rel.oid = pgc.conrelid
    join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(pgc.conkey)
    where rel.relname = 'tabela_orcamentos'
      and att.attname = 'numero_revisao'
      and pgc.contype = 'c'
  loop
    execute format('alter table tabela_orcamentos drop constraint %I', con.conname);
  end loop;
end $$;

-- Shift uniforme em TODA linha (não só quem tem irmãos) — preserva a ordem
-- relativa e a unicidade dentro de cada família, só desloca a origem de 1
-- para 0.
update tabela_orcamentos set numero_revisao = numero_revisao - 1;

alter table tabela_orcamentos
  alter column numero_revisao set default 0;

alter table tabela_orcamentos
  add constraint tabela_orcamentos_numero_revisao_check check (numero_revisao >= 0);

create unique index if not exists idx_tabela_orcamentos_grupo_revisao
  on tabela_orcamentos(grupo_id, numero_revisao);

NOTIFY pgrst, 'reload schema';
