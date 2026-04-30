-- =====================================================================
-- Migration: expor views ao role authenticated via PostgREST
-- =====================================================================
GRANT SELECT ON vw_custo_composicao  TO authenticated;
GRANT SELECT ON vw_total_orcamento   TO authenticated;