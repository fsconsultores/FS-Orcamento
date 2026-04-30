-- =====================================================================
-- Hierarquia: Pastas → Projetos → Orçamentos → Itens
-- Aplique no Supabase Dashboard > SQL Editor
-- =====================================================================

-- Pastas (owner = usuário autenticado)
CREATE TABLE IF NOT EXISTS folders (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT         NOT NULL CHECK (length(trim(name)) > 0),
    user_id    UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS folders_owner ON folders;
CREATE POLICY folders_owner ON folders
    FOR ALL TO authenticated
    USING     (user_id = auth.uid() AND public.is_authorized_domain())
    WITH CHECK (user_id = auth.uid() AND public.is_authorized_domain());

-- Projetos (visíveis somente ao dono da pasta)
CREATE TABLE IF NOT EXISTS projects (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT         NOT NULL CHECK (length(trim(name)) > 0),
    folder_id  UUID         NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_owner ON projects;
CREATE POLICY projects_owner ON projects
    FOR ALL TO authenticated
    USING (
        public.is_authorized_domain() AND
        EXISTS (SELECT 1 FROM folders f WHERE f.id = projects.folder_id AND f.user_id = auth.uid())
    )
    WITH CHECK (
        public.is_authorized_domain() AND
        EXISTS (SELECT 1 FROM folders f WHERE f.id = projects.folder_id AND f.user_id = auth.uid())
    );

-- Orçamentos simplificados (budget)
CREATE TABLE IF NOT EXISTS budgets (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT         NOT NULL CHECK (length(trim(name)) > 0),
    project_id UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budgets_owner ON budgets;
CREATE POLICY budgets_owner ON budgets
    FOR ALL TO authenticated
    USING (
        public.is_authorized_domain() AND
        EXISTS (
            SELECT 1 FROM projects p
            JOIN folders f ON f.id = p.folder_id
            WHERE p.id = budgets.project_id AND f.user_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_authorized_domain() AND
        EXISTS (
            SELECT 1 FROM projects p
            JOIN folders f ON f.id = p.folder_id
            WHERE p.id = budgets.project_id AND f.user_id = auth.uid()
        )
    );

-- Itens do orçamento (simples: nome + qtd + custo)
CREATE TABLE IF NOT EXISTS budget_items (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT          NOT NULL CHECK (length(trim(name)) > 0),
    quantity   NUMERIC(14,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_cost  NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
    budget_id  UUID          NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_items_owner ON budget_items;
CREATE POLICY budget_items_owner ON budget_items
    FOR ALL TO authenticated
    USING (
        public.is_authorized_domain() AND
        EXISTS (
            SELECT 1 FROM budgets b
            JOIN projects p ON p.id = b.project_id
            JOIN folders f  ON f.id = p.folder_id
            WHERE b.id = budget_items.budget_id AND f.user_id = auth.uid()
        )
    )
    WITH CHECK (
        public.is_authorized_domain() AND
        EXISTS (
            SELECT 1 FROM budgets b
            JOIN projects p ON p.id = b.project_id
            JOIN folders f  ON f.id = p.folder_id
            WHERE b.id = budget_items.budget_id AND f.user_id = auth.uid()
        )
    );

-- Confirmação
SELECT table_name, COUNT(*) AS policies
FROM pg_policies
WHERE table_name IN ('folders','projects','budgets','budget_items')
GROUP BY table_name ORDER BY table_name;
