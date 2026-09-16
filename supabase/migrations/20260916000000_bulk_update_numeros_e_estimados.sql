-- Otimização de performance: salvar em Configurações (renumeração da EAP) e
-- na aba Estimados fazia N updates individuais contra orcamento_estrutura
-- (em lotes concorrentes) a cada salvamento — mesma classe de problema já
-- resolvido pra sincronizar_custos_estrutura (ver
-- 20260831020000_sincronizar_custos_estrutura_bulk.sql), incluindo a mesma
-- contenção de pool sob carga concorrente identificada na auditoria de
-- performance (Fase 5): rodar N requisições ao mesmo tempo piora o
-- problema em vez de resolver. Reduz pra 1 round-trip por operação via
-- UPDATE em massa com unnest().
--
-- security invoker (padrão implícito, sem SECURITY DEFINER) — roda com a
-- sessão de quem chama, então a RLS domain-wide de orcamento_estrutura
-- continua valendo normalmente; o filtro por orcamento_id abaixo é defesa
-- em profundidade, não o mecanismo de autorização em si.

create or replace function atualizar_numeros_estrutura(
  p_orcamento_id uuid,
  p_ids uuid[],
  p_numeros text[],
  p_niveis int[]
)
returns void
language sql
as $$
  update orcamento_estrutura oe
  set numero = v.numero, nivel = v.nivel
  from (
    select unnest(p_ids) as id, unnest(p_numeros) as numero, unnest(p_niveis) as nivel
  ) v
  where oe.id = v.id
    and oe.orcamento_id = p_orcamento_id
$$;

create or replace function atualizar_itens_estimados(
  p_orcamento_id uuid,
  p_ids uuid[],
  p_estimados boolean[],
  p_motivos text[],
  p_valores numeric[]
)
returns void
language sql
as $$
  update orcamento_estrutura oe
  set estimado = v.estimado, estimado_motivo = v.motivo, valor_estimado = v.valor
  from (
    select unnest(p_ids) as id, unnest(p_estimados) as estimado, unnest(p_motivos) as motivo, unnest(p_valores) as valor
  ) v
  where oe.id = v.id
    and oe.orcamento_id = p_orcamento_id
$$;

NOTIFY pgrst, 'reload schema';
