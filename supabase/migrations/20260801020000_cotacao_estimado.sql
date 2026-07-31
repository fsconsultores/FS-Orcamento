-- Correção de regra de negócio: "preço estimado" pertence à COTAÇÃO do
-- insumo (orcamento_insumo_cotacoes), não a uma marcação manual solta em
-- cima do insumo. Um orçamentista nunca marca um item da planilha como
-- "estimado" — ele registra um preço para um insumo e, ao fazer isso,
-- informa se esse preço é provisório ("estimado", com motivo opcional) ou
-- definitivo. O Caderno deriva "Serviços com Preços Estimados" 100% a
-- partir disso: percorre item → composição → insumos e verifica se algum
-- tem preço estimado — nunca lê uma marcação própria do item/serviço.
--
-- orcamento_insumos.estimado/estimado_motivo (20260801000000) deixam de ser
-- editáveis por checkbox e passam a ser só um snapshot da cotação ativa —
-- mesmo padrão já usado para fornecedor/data_cotacao/cotacao_observacoes,
-- copiado pelo upsertAvulsoInsumo tanto no avulso quanto nas cópias
-- embutidas em composição com o mesmo código (evita join no Caderno).
alter table public.orcamento_insumo_cotacoes
  add column if not exists estimado boolean not null default false,
  add column if not exists estimado_motivo text;

NOTIFY pgrst, 'reload schema';
