-- Bug: orcamento_insumo_historico_precos.preco_novo/preco_anterior foram
-- criados como numeric(14,4) (10 dígitos inteiros, até ~9,999999999,9999) —
-- mas orcamento_insumos.custo é numeric(15,4) (11 dígitos inteiros, até
-- ~99,999999999,9999). Um preço alto o suficiente pra caber em `custo` mas
-- passar de 10 dígitos inteiros atualizava o insumo normalmente (update
-- silencioso, sem checar erro) mas falhava ao inserir no histórico — o
-- gráfico "parava de atualizar" porque o INSERT nunca completava, e o erro
-- era engolido (`.then(null, console.error)` só pega falha de rede/exceção,
-- não o `{error}` que o supabase-js retorna em erro de query).
--
-- Correção: numeric sem precisão/escala fixa = precisão arbitrária no
-- Postgres, nunca mais estoura por causa de dígitos demais.
ALTER TABLE public.orcamento_insumo_historico_precos
  ALTER COLUMN preco_anterior TYPE numeric,
  ALTER COLUMN preco_novo     TYPE numeric;

NOTIFY pgrst, 'reload schema';
