-- =====================================================================
-- DADOS DE TESTE - SISTEMA DE ORÇAMENTO DE OBRAS
-- Versão SQL puro (sem DO block / PL/pgSQL).
-- Pré-requisito: ter pelo menos 1 usuário em auth.users.
--
-- Para re-executar do zero, descomente:
-- =====================================================================

-- DELETE FROM tabela_itens_orcamento;
-- DELETE FROM tabela_orcamentos WHERE nome_obra = 'Casa Térrea 80m² - Bairro Jardim';
-- DELETE FROM tabela_itens_composicao;
-- DELETE FROM tabela_composicoes WHERE codigo IN ('C001','C002');
-- DELETE FROM tabela_insumos     WHERE codigo IN ('I001','I002','I003','I004','I005','I006','I007');

-- =====================================================================
-- 1) INSUMOS
-- =====================================================================
INSERT INTO tabela_insumos (codigo, descricao, unidade, preco_base, fonte, data_referencia) VALUES
    ('I001', 'Tijolo cerâmico furado 9x14x19cm',          'un', 0.85,   'SINAPI', '2025-01-01'),
    ('I002', 'Argamassa de assentamento traço 1:2:8',     'kg', 0.50,   'SINAPI', '2025-01-01'),
    ('I003', 'Pedreiro com encargos complementares',      'h',  25.00,  'SINAPI', '2025-01-01'),
    ('I004', 'Servente com encargos complementares',      'h',  18.00,  'SINAPI', '2025-01-01'),
    ('I005', 'Cimento Portland CP-II 32 saco 50kg',       'kg', 0.70,   'SINAPI', '2025-01-01'),
    ('I006', 'Areia média lavada',                         'm3', 100.00, 'SINAPI', '2025-01-01'),
    ('I007', 'Brita nº 1',                                 'm3', 110.00, 'SINAPI', '2025-01-01');

-- =====================================================================
-- 2) COMPOSIÇÕES
-- =====================================================================
INSERT INTO tabela_composicoes (codigo, descricao, unidade) VALUES
    ('C001', 'Alvenaria de tijolo cerâmico furado, esp. 9cm',     'm2'),
    ('C002', 'Concreto estrutural fck 25 MPa, preparo em obra',   'm3');

-- =====================================================================
-- 3) ITENS DE COMPOSIÇÃO
--    Resolve os UUIDs via JOIN nos códigos únicos (chave natural).
--    Pedreiro (I003) e Servente (I004) aparecem nas duas composições
--    → testa a relação N:N corretamente.
-- =====================================================================
INSERT INTO tabela_itens_composicao (composicao_id, insumo_id, indice)
SELECT c.id, i.id, dados.indice
FROM (VALUES
    ('C001', 'I001',  25.00),
    ('C001', 'I002',  12.00),
    ('C001', 'I003',   0.80),
    ('C001', 'I004',   0.40),
    ('C002', 'I005', 350.00),
    ('C002', 'I006',   0.65),
    ('C002', 'I007',   0.85),
    ('C002', 'I003',   4.00),
    ('C002', 'I004',   4.00)
) AS dados(comp_codigo, ins_codigo, indice)
JOIN tabela_composicoes c ON c.codigo = dados.comp_codigo
JOIN tabela_insumos     i ON i.codigo = dados.ins_codigo;

-- =====================================================================
-- 4) ORÇAMENTO + ITENS DO ORÇAMENTO (em uma única transação via CTE)
--    A CTE 'novo' insere o orçamento e devolve seu id.
--    O INSERT de baixo usa esse id para criar os itens.
-- =====================================================================
WITH novo AS (
    INSERT INTO tabela_orcamentos (user_id, nome_obra, cliente, data, bdi_global)
    VALUES (
        (SELECT id FROM auth.users ORDER BY created_at LIMIT 1),
        'Casa Térrea 80m² - Bairro Jardim',
        'João da Silva',
        CURRENT_DATE,
        0.2500
    )
    RETURNING id
)
INSERT INTO tabela_itens_orcamento (orcamento_id, composicao_id, quantidade, bdi_especifico)
SELECT
    novo.id,
    c.id,
    dados.quantidade,
    dados.bdi_especifico
FROM novo
CROSS JOIN (VALUES
    ('C001', 120.00, NULL::NUMERIC(7,4)),    -- usa BDI global (25%)
    ('C002',   8.00, 0.1500::NUMERIC(7,4))   -- BDI específico (15%)
) AS dados(comp_codigo, quantidade, bdi_especifico)
JOIN tabela_composicoes c ON c.codigo = dados.comp_codigo;

-- =====================================================================
-- VERIFICAÇÃO 1 - Custo unitário de cada composição
-- Esperado:
--   C001 (alvenaria) → 54.45  /m²
--   C002 (concreto)  → 575.50 /m³
-- =====================================================================
SELECT
    c.codigo,
    c.descricao,
    c.unidade,
    SUM(ic.indice * i.preco_base)::NUMERIC(14,2) AS custo_unitario
FROM tabela_composicoes c
JOIN tabela_itens_composicao ic ON ic.composicao_id = c.id
JOIN tabela_insumos i           ON i.id            = ic.insumo_id
GROUP BY c.codigo, c.descricao, c.unidade
ORDER BY c.codigo;

-- =====================================================================
-- VERIFICAÇÃO 2 - Total do orçamento
-- Esperado:
--   total_sem_bdi = 11.138,00
--   total_com_bdi = 13.462,10
-- =====================================================================
SELECT
    o.nome_obra,
    o.cliente,
    SUM(io.quantidade * sub.custo_unitario)::NUMERIC(14,2) AS total_sem_bdi,
    SUM(io.quantidade * sub.custo_unitario
        * (1 + COALESCE(io.bdi_especifico, o.bdi_global)))::NUMERIC(14,2) AS total_com_bdi
FROM tabela_orcamentos o
JOIN tabela_itens_orcamento io ON io.orcamento_id = o.id
JOIN (
    SELECT ic.composicao_id, SUM(ic.indice * i.preco_base) AS custo_unitario
    FROM tabela_itens_composicao ic
    JOIN tabela_insumos i ON i.id = ic.insumo_id
    GROUP BY ic.composicao_id
) sub ON sub.composicao_id = io.composicao_id
GROUP BY o.id, o.nome_obra, o.cliente;
