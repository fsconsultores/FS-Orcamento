-- Otimização de performance (retomada da auditoria de junho-agosto/2026 —
-- item "P8" pendente: sincronizarCustosPlanilha fazia N/10 lotes de 10
-- updates CONCORRENTES sequenciais contra orcamento_estrutura. Rodar 10
-- requisições ao mesmo tempo por lote piora o problema em vez de resolver:
-- a auditoria (Fase 5) já validou que este ambiente sofre CONTENÇÃO NO POOL
-- de conexões sob carga concorrente, então cada lote pagava tanto o número
-- de round-trips quanto essa penalidade extra. A alavanca certa é reduzir
-- pra 1 round-trip só, com um UPDATE em massa via unnest().
--
-- security invoker (padrão implícito, sem SECURITY DEFINER) — roda com a
-- sessão de quem chama, então a RLS domain-wide de orcamento_estrutura
-- (orcamento_estrutura_domain, is_authorized_domain()) continua valendo
-- normalmente; o filtro por orcamento_id abaixo é defesa em profundidade,
-- não o mecanismo de autorização em si.
create or replace function sincronizar_custos_estrutura(
  p_orcamento_id uuid,
  p_ids uuid[],
  p_custos numeric[]
)
returns void
language sql
as $$
  update orcamento_estrutura oe
  set custo_unitario = v.custo
  from (
    select unnest(p_ids) as id, unnest(p_custos) as custo
  ) v
  where oe.id = v.id
    and oe.orcamento_id = p_orcamento_id
$$;

NOTIFY pgrst, 'reload schema';
