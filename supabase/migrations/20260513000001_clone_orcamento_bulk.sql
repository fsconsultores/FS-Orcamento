-- Reescreve clone_orcamento usando bulk inserts em vez de loops row-by-row.
-- Antes: 1 INSERT por linha de estrutura + 1 INSERT por composição → timeout em orçamentos grandes.
-- Depois: 1 INSERT por nível de estrutura + 1 INSERT total de composições.

CREATE OR REPLACE FUNCTION clone_orcamento(
  p_orcamento_id uuid,
  p_novo_codigo  text
)
RETURNS json
LANGUAGE plpgsql
SET statement_timeout = '120s'
AS $$
DECLARE
  v_user_id        uuid    := auth.uid();
  v_orig           record;
  v_novo_id        uuid;
  v_nome_novo      text;
  v_n_copias       bigint;
  v_struct_id_map  jsonb   := '{}'::jsonb;
  v_comp_id_map    jsonb   := '{}'::jsonb;
  v_nivel          integer;
  v_max_nivel      integer;
  v_item_count     bigint;
BEGIN
  -- 1. Busca original (RLS garante que pertence ao usuário)
  SELECT nome_obra, cliente, data, bdi_global
  INTO v_orig
  FROM tabela_orcamentos
  WHERE id = p_orcamento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orçamento não encontrado';
  END IF;

  -- 2. Gera nome da cópia
  SELECT COUNT(*) INTO v_n_copias
  FROM tabela_orcamentos
  WHERE user_id = v_user_id
    AND nome_obra ILIKE 'Cópia%de ' || v_orig.nome_obra;

  v_nome_novo := CASE v_n_copias
    WHEN 0 THEN 'Cópia de ' || v_orig.nome_obra
    ELSE        'Cópia ' || (v_n_copias + 1) || ' de ' || v_orig.nome_obra
  END;

  -- 3. Cria novo orçamento
  INSERT INTO tabela_orcamentos (user_id, nome_obra, cliente, data, bdi_global, codigo)
  VALUES (v_user_id, v_nome_novo, v_orig.cliente, v_orig.data, v_orig.bdi_global, p_novo_codigo)
  RETURNING id INTO v_novo_id;

  -- 4. Clona estrutura — um único INSERT por nível (bulk, não row-by-row)
  --    Usa row_number() para correlacionar old_id → new_id após RETURNING.
  SELECT MAX(nivel) INTO v_max_nivel
  FROM orcamento_estrutura
  WHERE orcamento_id = p_orcamento_id;

  FOR v_nivel IN 1..COALESCE(v_max_nivel, 0) LOOP
    WITH src AS (
      SELECT id, parent_id, numero, nivel, codigo, descricao,
             unidade, quantidade, custo_unitario, tipo, ordem,
             row_number() OVER (ORDER BY ordem, id) AS rn
      FROM orcamento_estrutura
      WHERE orcamento_id = p_orcamento_id AND nivel = v_nivel
    ),
    ins AS (
      INSERT INTO orcamento_estrutura (
        orcamento_id, parent_id, numero, nivel, codigo, descricao,
        unidade, quantidade, custo_unitario, tipo, ordem
      )
      SELECT v_novo_id,
             CASE WHEN s.parent_id IS NOT NULL
                  THEN (v_struct_id_map->>(s.parent_id::text))::uuid
                  ELSE NULL END,
             s.numero, s.nivel, s.codigo, s.descricao,
             s.unidade, s.quantidade, s.custo_unitario, s.tipo, s.ordem
      FROM src s ORDER BY s.rn
      RETURNING id
    ),
    new_ids AS (
      SELECT id AS new_id, row_number() OVER () AS rn FROM ins
    )
    SELECT v_struct_id_map || COALESCE(jsonb_object_agg(src.id::text, new_ids.new_id::text), '{}')
    INTO v_struct_id_map
    FROM src JOIN new_ids USING (rn);
  END LOOP;

  -- 5. Clona composições — um único INSERT para todas (bulk)
  WITH src AS (
    SELECT id, codigo, descricao, unidade, base,
           row_number() OVER (ORDER BY id) AS rn
    FROM orcamento_composicoes
    WHERE orcamento_id = p_orcamento_id
  ),
  ins AS (
    INSERT INTO orcamento_composicoes (orcamento_id, codigo, descricao, unidade, base)
    SELECT v_novo_id, codigo, descricao, unidade, base
    FROM src ORDER BY rn
    RETURNING id
  ),
  new_ids AS (
    SELECT id AS new_id, row_number() OVER () AS rn FROM ins
  )
  SELECT COALESCE(jsonb_object_agg(src.id::text, new_ids.new_id::text), '{}')
  INTO v_comp_id_map
  FROM src JOIN new_ids USING (rn);

  -- 6. Clona itens (já era set-based)
  INSERT INTO tabela_itens_orcamento (
    orcamento_id, composicao_id, orcamento_composicao_id, quantidade, bdi_especifico
  )
  SELECT v_novo_id,
         composicao_id,
         CASE WHEN orcamento_composicao_id IS NOT NULL
              THEN (v_comp_id_map->>(orcamento_composicao_id::text))::uuid
              ELSE NULL END,
         quantidade, bdi_especifico
  FROM tabela_itens_orcamento
  WHERE orcamento_id = p_orcamento_id;

  -- 7. Clona insumos (já era set-based)
  INSERT INTO orcamento_insumos (
    orcamento_id, codigo, descricao, unidade, custo, indice, grupo, base, data_ref, composicao_id
  )
  SELECT v_novo_id,
         codigo, descricao, unidade, custo, COALESCE(indice, 1), grupo, base, data_ref,
         CASE WHEN composicao_id IS NOT NULL
              THEN (v_comp_id_map->>(composicao_id::text))::uuid
              ELSE NULL END
  FROM orcamento_insumos
  WHERE orcamento_id = p_orcamento_id;

  -- 8. Resultado
  SELECT COUNT(*) INTO v_item_count
  FROM tabela_itens_orcamento
  WHERE orcamento_id = v_novo_id;

  RETURN json_build_object(
    'id',         v_novo_id,
    'nome_obra',  v_nome_novo,
    'cliente',    v_orig.cliente,
    'data',       v_orig.data,
    'bdi_global', v_orig.bdi_global,
    'codigo',     p_novo_codigo,
    'item_count', v_item_count
  );
END;
$$;
