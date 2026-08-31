-- Otimização de performance (retomada da auditoria de junho-agosto/2026,
-- ver memória "Auditoria Performance" — a alavanca certa neste ambiente é
-- REDUZIR NÚMERO DE ROUND-TRIPS, não latência por query individual, já que
-- até um select de 1 linha já custa 200ms-1s+ aqui).
--
-- get_orcamento_header_completo() substitui as 3 consultas sequenciais que
-- rodavam em TODA navegação de qualquer aba de qualquer orçamento (cabeçalho
-- + grupo_id/numero_revisao do próprio orçamento + contagem de irmãos da
-- família de revisões) por 1 única chamada RPC — 1 round-trip em vez de 3,
-- pago em TODA visita a /orcamentos/[id]/*, não só quando há revisões.
create or replace function get_orcamento_header_completo(p_orcamento_id uuid)
returns table (
  nome_obra text,
  codigo text,
  cliente text,
  bdi_global numeric,
  data date,
  numero_revisao integer,
  total_revisoes integer
)
language sql
stable
security invoker
as $$
  select
    o.nome_obra,
    o.codigo,
    o.cliente,
    o.bdi_global,
    o.data,
    o.numero_revisao,
    (select count(*)::int from tabela_orcamentos t where t.grupo_id = o.grupo_id) as total_revisoes
  from tabela_orcamentos o
  where o.id = p_orcamento_id
$$;

NOTIFY pgrst, 'reload schema';
