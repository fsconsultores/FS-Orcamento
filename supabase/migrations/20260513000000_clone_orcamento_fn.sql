-- Função que clona um orçamento inteiramente dentro do banco de dados,
-- eliminando os múltiplos roundtrips Node.js → Supabase da abordagem manual.
--
-- Executa com SECURITY INVOKER (padrão): auth.uid() e RLS funcionam
-- normalmente pois a função roda no contexto do usuário autenticado.

CREATE OR REPLACE FUNCTION clone_orcamento(
  p_orcamento_id uuid,
  p_novo_codigo  text
)
RETURNS json
LANGUAGE plpgsql
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
  r                record;
  v_new_id         uuid;
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

  -- 2. Gera nome "Cópia de X" ou "Cópia N de X"
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

  -- 4. Clona estrutura hierárquica nível a nível para preservar parent_id
  SELECT MAX(nivel) INTO v_max_nivel
  FROM orcamento_estrutura
  WHERE orcamento_id = p_orcamento_id;

  FOR v_nivel IN 1..COALESCE(v_max_nivel, 0) LOOP
    FOR r IN
      SELECT id, parent_id, numero, nivel, codigo, descricao,
             unidade, quantidade, custo_unitario, tipo, ordem
      FROM orcamento_estrutura
      WHERE orcamento_id = p_orcamento_id AND nivel = v_nivel
      ORDER BY ordem
    LOOP
      INSERT INTO orcamento_estrutura (
        orcamento_id, parent_id, numero, nivel, codigo, descricao,
        unidade, quantidade, custo_unitario, tipo, ordem
      ) VALUES (
        v_novo_id,
        CASE WHEN r.parent_id IS NOT NULL
             THEN (v_struct_id_map->>(r.parent_id::text))::uuid
             ELSE NULL END,
        r.numero, r.nivel, r.codigo, r.descricao,
        r.unidade, r.quantidade, r.custo_unitario, r.tipo, r.ordem
      )
      RETURNING id INTO v_new_id;
      v_struct_id_map := v_struct_id_map || jsonb_build_object(r.id::text, v_new_id::text);
    END LOOP;
  END LOOP;

  -- 5. Clona composições e constrói mapa old_id → new_id
  FOR r IN
    SELECT id, codigo, descricao, unidade, base
    FROM orcamento_composicoes
    WHERE orcamento_id = p_orcamento_id
  LOOP
    INSERT INTO orcamento_composicoes (orcamento_id, codigo, descricao, unidade, base)
    VALUES (v_novo_id, r.codigo, r.descricao, r.unidade, r.base)
    RETURNING id INTO v_new_id;
    v_comp_id_map := v_comp_id_map || jsonb_build_object(r.id::text, v_new_id::text);
  END LOOP;

  -- 6. Clona itens remapeando orcamento_composicao_id para o novo orçamento
  INSERT INTO tabela_itens_orcamento (
    orcamento_id, composicao_id, orcamento_composicao_id, quantidade, bdi_especifico
  )
  SELECT
    v_novo_id,
    composicao_id,
    CASE WHEN orcamento_composicao_id IS NOT NULL
         THEN (v_comp_id_map->>(orcamento_composicao_id::text))::uuid
         ELSE NULL END,
    quantidade,
    bdi_especifico
  FROM tabela_itens_orcamento
  WHERE orcamento_id = p_orcamento_id;

  -- 7. Clona insumos remapeando composicao_id para o novo orçamento
  INSERT INTO orcamento_insumos (
    orcamento_id, codigo, descricao, unidade, custo, indice, grupo, base, data_ref, composicao_id
  )
  SELECT
    v_novo_id,
    codigo, descricao, unidade, custo, COALESCE(indice, 1), grupo, base, data_ref,
    CASE WHEN composicao_id IS NOT NULL
         THEN (v_comp_id_map->>(composicao_id::text))::uuid
         ELSE NULL END
  FROM orcamento_insumos
  WHERE orcamento_id = p_orcamento_id;

  -- 8. Conta itens e retorna resultado completo
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
