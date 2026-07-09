# FS-Orcamento

Sistema de orçamentação de obras para a FS Consultores. Permite elaborar, gerenciar e analisar orçamentos de construção civil com estrutura hierárquica de serviços, insumos e composições analíticas, com análise de Curva ABC e exportação para XLSX.

---

## Sumário

- [Stack tecnológico](#stack-tecnológico)
- [Arquitetura](#arquitetura)
- [Modelo de dados](#modelo-de-dados)
- [Motor de cálculo](#motor-de-cálculo)
- [Módulos da aplicação](#módulos-da-aplicação)
- [Autenticação](#autenticação)
- [Configuração do ambiente](#configuração-do-ambiente)
- [Instalação e execução](#instalação-e-execução)
- [Banco de dados](#banco-de-dados)
- [Formatos de importação suportados](#formatos-de-importação-suportados)
- [Estrutura de arquivos](#estrutura-de-arquivos)

---

## Stack tecnológico

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework | Next.js (App Router) | 15.3 |
| UI | React | 19 |
| Linguagem | TypeScript | 5 |
| Estilo | Tailwind CSS | 3.4 |
| Banco de dados | PostgreSQL via Supabase | — |
| Auth | Supabase Auth + Azure AD (SSO) | — |
| Planilhas (import/export XLSX) | xlsx / exceljs | 0.18 / 4.4 |
| Relatórios PDF | jsPDF / jspdf-autotable | 4.2 / 5.0 |
| Virtualização | @tanstack/react-virtual | 3.14 |
| Drag-and-drop | @dnd-kit/core | 6.3 |

---

## Arquitetura

### Modelo de execução

A aplicação usa exclusivamente o **Next.js App Router** com o padrão Server Components + Server Actions:

- **Server Components** buscam dados diretamente do Supabase no servidor, sem round-trip de API. Nenhum dado é exposto via REST/GraphQL customizado.
- **Server Actions** (`'use server'`) executam mutações (insert, update, delete). `revalidatePath` é usado com moderação — foi deliberadamente removido de pontos de edição de alta frequência (ex.: célula da planilha), já que o estado do cliente é gerenciado localmente e uma revalidação por tecla degradaria a UX em planilhas grandes.
- **Client Components** (`'use client'`) são usados apenas onde há interatividade: edição inline, filtros, paginação, modais e uploads. Mutações de baixa latência (ex.: atualização de custo de insumo) chamam o cliente Supabase diretamente do browser para evitar round-trip via Server Action.

### Segurança de dados

- **Row Level Security (RLS)** habilitada em todas as tabelas do Supabase.
- Cada usuário acessa apenas seus próprios orçamentos (`user_id = auth.uid()`).
- Bases de referência globais (`tabela_insumos`, `tabela_composicoes`) são somente-leitura para todos os usuários autenticados.
- O acesso ao sistema é restrito por domínio de e-mail (ver `src/lib/auth/validate-domain.ts`).

### Fluxo de dados

```
Browser
  │
  ├── Server Component (RSC)
  │     └── Supabase (server client)  →  PostgreSQL
  │           └── dados renderizados no HTML
  │
  └── Client Component
        ├── Server Action  →  Supabase (server client)  →  PostgreSQL
        │                      └── revalidatePath() → RSC re-render
        └── Supabase (browser client)  →  PostgreSQL  (mutações rápidas)
```

---

## Modelo de dados

### Biblioteca global (compartilhada entre orçamentos)

```
tabela_bases
  id, nome, orgao, tipo_base (externa|propria), user_id

tabela_insumos
  id, codigo (unique), descricao, unidade, preco_base,
  grupo, fonte, data_referencia, base_id → tabela_bases, base_origem

tabela_composicoes
  id, codigo (unique), descricao, unidade, base_id → tabela_bases

tabela_itens_composicao
  composicao_id → tabela_composicoes
  insumo_id     → tabela_insumos
  indice        (coeficiente de consumo)
```

### Orçamento (isolado por `orcamento_id`)

```
tabela_orcamentos
  id, user_id, codigo, nome_obra, cliente, local, data,
  bdi_global, area_total, area_coberta, area_equivalente,
  numeracao_digitos, categorias_grafico,
  ultimo_acesso, created_at

orcamento_planilhas             (planilhas do orçamento — um orçamento pode ter várias)
  id, orcamento_id, nome, bdi_global,
  total_custo, total_com_bdi, ultima_calculo_em, invalidado_em

orcamento_composicoes           (cópia local de composições para o orçamento)
  id, orcamento_id, codigo, descricao, unidade, base, base_origem,
  custo_unitario, calculado_em, deleted_at, deleted_by

orcamento_insumos               (insumos dentro de composições OU avulsos)
  id, orcamento_id, composicao_id (nullable), codigo,
  descricao, unidade, custo, indice, grupo, base, base_origem, data_ref,
  custo_atualizado_em, deleted_at, deleted_by

orcamento_estrutura              (planilha orçamentária hierárquica)
  id, orcamento_id, planilha_id, parent_id (self-ref), numero, nivel,
  codigo, descricao, unidade, quantidade, custo_unitario,
  bdi_especifico, tipo (grupo|item), ordem

orcamento_versoes                (snapshot imutável do orçamento — "commits")
  id, orcamento_id, descricao, dados (JSONB por tabela), user_id, created_at

historico_alteracoes             (auditoria unificada — substitui tabela_logs/orcamento_logs)
  id, orcamento_id (nullable p/ eventos globais), user_id, usuario_email,
  entidade, tipo, acao, mensagem, valor_anterior, valor_novo, detalhes, created_at
```

### Regras de negócio principais

- Um **insumo avulso** tem `composicao_id IS NULL` — é o preço "canônico" do código no orçamento inteiro. Um insumo dentro de uma composição tem `composicao_id` preenchido; seu campo `custo` é uma cópia sincronizada a partir do avulso (o avulso tem prioridade quando os dois existem).
- A **planilha** (`orcamento_estrutura`) é hierárquica e pertence a uma `orcamento_planilhas` (`planilha_id`). Itens com `tipo = 'grupo'` são capítulos/seções; itens com `tipo = 'item'` são serviços ou insumos diretos. Composições e insumos são compartilhados por todas as planilhas do mesmo orçamento.
- O **BDI** pode ser global (`bdi_global`, por orçamento ou por planilha) ou específico por item (`bdi_especifico` na estrutura). O item específico tem precedência.
- **Custo de composição** é recalculado pelo motor de cálculo (`src/lib/orcamento/motor-calculo.ts`) e persistido em `orcamento_composicoes.custo_unitario`/`calculado_em` — não é uma view em tempo real. Ver [Motor de cálculo](#motor-de-cálculo).
- **Soft delete**: composições/insumos órfãos são marcados com `deleted_at`/`deleted_by` (função "Calcular e Limpar Projeto"), nunca removidos fisicamente; bases nacionais (SINAPI/DNIT/DER/SUDECAP) nunca são removidas.

---

## Motor de cálculo

`src/lib/orcamento/motor-calculo.ts` recalcula `orcamento_composicoes.custo_unitario` e propaga para `orcamento_estrutura.custo_unitario`, com 4 modos (`ModoCalculo`):

| Modo | Uso | Comportamento |
|---|---|---|
| `planilha` | Automático (após editar célula) | Delta detection: só recalcula composições cujo insumo mudou desde o último cálculo, atualiza só a planilha ativa |
| `todas` | Automático (após alterar preço de insumo) | Delta detection, mas atualiza a estrutura de **todas** as planilhas do orçamento |
| `forca` | Botão "Calcular Planilha"/"Calcular Projeto" | Ignora o delta — recalcula **todas** as composições do zero |
| `limpar` | Botão "Calcular e Limpar Projeto" | Igual a `forca` + detecta composições/insumos órfãos (não usados em nenhuma planilha) para confirmação do usuário |

A detecção de delta compara `orcamento_insumos.custo_atualizado_em` (atualizado automaticamente por trigger sempre que `custo` muda) com `orcamento_composicoes.calculado_em`; sub-composições sujas propagam a "sujeira" para quem as usa. Preços de insumo têm prioridade em cascata: **avulso da composição atual > avulso do projeto > custo gravado na linha**.

Edição de preço de insumo a partir de qualquer tela do orçamento (Planilha Analítica, Curva ABC, detalhe da composição) passa por `atualizarPrecoInsumoAction` → `upsertAvulsoInsumo`, que atualiza o avulso canônico **e** sincroniza todas as cópias do mesmo código em outras composições, disparando recálculo do projeto em segundo plano.

---

## Módulos da aplicação

### Dashboard (`/dashboard`)
Widgets independentes (Server Components, cada um com `<Suspense>` próprio, em `src/app/(app)/dashboard/widgets/`): quantidade de projetos, últimos projetos acessados, valor total (soma de `orcamento_planilhas.total_com_bdi` — totais reais persistidos), últimos commits de versão, Curva ABC resumida do orçamento mais recentemente acessado, atividades recentes do usuário (`historico_alteracoes`).

### Orçamentos (`/orcamentos`)
CRUD completo de orçamentos, com suporte a **múltiplas planilhas** por orçamento (todas compartilham as mesmas composições/insumos). Cada orçamento agrupa:

| Sub-rota | Descrição |
|---|---|
| `/planilha` | Planilha orçamentária hierárquica (grupos + itens), com seletor de planilha ativa. Edição inline, virtualização para milhares de linhas, drag-and-drop, modo "Analítica" (expande insumos de cada composição inline). Importação CSV/XLSX. |
| `/insumos` | Tabela de preços do orçamento. Edição de custo com navegação estilo Excel (Enter avança linha). Filtro Todos/Utilizados/Não utilizados. |
| `/composicoes` | Composições analíticas vinculadas ao orçamento — adicionar/remover insumos, editar índice e preço unitário (propaga para todo o projeto). Exportação/importação de modelo XLSX. |
| `/curva-abc` | Análise ABC por **Serviços** e por **Insumos**, em abas por categoria (Geral/Materiais/Mão de Obra/Equipamentos/Serviços). |
| `/relatorios` | Exportação de relatórios: **Caderno de Orçamento** (PDF completo, 11 seções — ver abaixo), Planilha de Orçamento, Planilha Analítica, Planilha Analítica Decomposta, Curva ABC (Serviços/Insumos) — todos em XLSX ou PDF. |
| `/versoes` | Versionamento (commits): snapshot imutável do estado completo do orçamento, com restauração. Nunca expira/apaga automaticamente. |
| `/importar` | Importação de insumos e composições a partir de arquivos XLSX/CSV (SINAPI, SUDECAP, DNIT/SICRO, formato simples). |
| `/configuracoes` | BDI, numeração hierárquica da planilha, áreas (para custo/m²), categorias do gráfico de distribuição de custos. |
| `/logs` | Histórico de alterações do orçamento (cálculos, importações, edições de preço, exclusões) com restauração de itens apagados. |

**Clonagem de orçamento:** função PostgreSQL `clone_orcamento` copia toda a estrutura (composições, insumos, planilhas) para um novo orçamento.

### Caderno de Orçamento (PDF)

Relatório único gerado em `src/app/(app)/orcamentos/[id]/caderno/export-caderno-pdf.ts` (jsPDF + jspdf-autotable), com capa, divisórias numeradas e 11 seções: Carta de Apresentação, Lista de Projetos, Resumo Geral do Orçamento (KPIs + gráfico de distribuição de custos), Custo/m², Planilha de Preços Unitários (com classificação **ABC** por item, mesmo critério da planilha interativa), Curva ABC Insumos, Curva ABC de Serviços, Planilha Analítica de Preços Unitários (com ABC), Lista de Insumos, Anexos e Cotações (placeholders). Dados agregados em `src/lib/orcamento/caderno.ts` (`getCadernoData`).

### Insumos (`/insumos`)
Biblioteca global de insumos. Importação via SINAPI, SUDECAP ou planilha própria.

### Composições (`/composicoes`)
Biblioteca global de composições analíticas. Visualização hierárquica insumo → coeficiente → custo calculado.

### Bases (`/bases`)
Gerenciamento de bases de referência (SINAPI, SUDECAP, DER, DNIT, bases próprias). Importação de XLSX analítico com detecção automática de formato.

### Logs (`/logs`)
Auditoria de operações relevantes do sistema.

---

## Curva ABC — lógica de classificação

A distinção entre **Serviços** e **Insumos** na Curva ABC segue:

1. **Serviço**: item da planilha cujo `codigo` referencia uma composição em `orcamento_composicoes` **e** essa composição possui sub-insumos em `orcamento_insumos`.
2. **Insumo**: qualquer outro item — seja código sem composição correspondente, seja composição sem sub-itens cadastrados.
3. Na aba Insumos, sub-composições (código presente em `orcamento_composicoes`) são excluídas para evitar dupla contagem; o resultado final é limitado a itens cujo `codigo` comece com `I` (insumos reais).
4. Itens diretos da planilha sem código `I` podem ser remapeados para o código `I` de um insumo avulso (`composicao_id` nulo) com a mesma descrição.
5. Quando a `descricao` de um sub-insumo é idêntica à `descricao` da própria composição (rótulo genérico/desatualizado de catálogo), usa-se a `descricao` do item da planilha correspondente, que reflete o uso real no projeto.
6. A quantidade usada de cada composição é propagada por composições aninhadas: se a composição A (usada na planilha) tem entre seus sub-itens o `codigo` de outra composição B, a quantidade efetiva de B (e de seus sub-insumos) também passa a considerar `qtd(A) × índice(A→B)`, recursivamente.
7. Quando o `codigo` de uma composição não corresponde a nenhum item da planilha (quantidade efetiva = 0) mas sua `descricao` coincide (por prefixo) com a de um único item direto da planilha, essa quantidade é usada como fallback — caso de itens cujo código foi reatribuído na planilha mas a composição manteve o código original.
8. O custo unitário de um sub-insumo é o custo do insumo avulso (`composicao_id` nulo) com o mesmo `codigo`, quando existir — a "tabela de preços" do orçamento —, e só usa o `custo` gravado na própria linha do sub-insumo quando não há avulso correspondente. Esse é o mesmo critério usado em `getComposicoesByOrcamento` para calcular o `custo_unitario` das composições.

---

## Autenticação

O sistema usa dois mecanismos em conjunto:

1. **Supabase Auth** — gerencia sessões, tokens JWT e cookies `sb-*`.
2. **Azure Active Directory (SSO)** — autenticação via Microsoft Entra ID para contas corporativas.

O middleware de autenticação valida a sessão em todas as rotas do grupo `(app)`. Usuários sem sessão são redirecionados para `/login`.

O acesso é adicionalmente restrito por domínio de e-mail via `validate-domain.ts` — somente endereços autorizados podem criar conta ou fazer login.

---

## Configuração do ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# Supabase — obter em: Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Azure AD SSO — obter em: portal.azure.com → Microsoft Entra ID → App registrations
AZURE_TENANT_ID=<tenant-id>
AZURE_CLIENT_ID=<client-id>
AZURE_CLIENT_SECRET=<client-secret>
```

> **Atenção:** `SUPABASE_SERVICE_ROLE_KEY` e `AZURE_CLIENT_SECRET` nunca devem ser expostos no cliente. Variáveis sem prefixo `NEXT_PUBLIC_` são acessíveis apenas no servidor.

---

## Instalação e execução

### Pré-requisitos

- Node.js ≥ 20
- npm ≥ 10
- Projeto Supabase criado com migrações aplicadas

### Passos

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# editar .env com as credenciais corretas

# 3. Aplicar migrações no Supabase
#    Via CLI do Supabase:
npx supabase db push
#    Ou manualmente via Supabase Studio → SQL Editor

# 4. Iniciar servidor de desenvolvimento
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`.

### Outros scripts

```bash
npm run build        # build de produção
npm run start        # iniciar build de produção
npm run type-check   # verificação de tipos TypeScript (sem emissão)
npm run lint         # ESLint
```

---

## Banco de dados

### Migrações

As migrações ficam em `supabase/migrations/` e devem ser aplicadas em ordem cronológica. Cada arquivo é prefixado com timestamp `YYYYMMDDHHMMSS`.

| Arquivo | Conteúdo |
|---|---|
| `20260101000000_initial_schema` | Schema base: insumos, composições, orçamentos, RLS, views de custo |
| `20260101000001_domain_restriction` | Restrição de acesso por domínio de e-mail |
| `20260429000000_insert_policies` | Políticas RLS de inserção |
| `20260429000001_update_delete_policies` | Políticas RLS de atualização e exclusão |
| `20260429000002_view_grants` | Grants de acesso às views |
| `20260430000000_fix_rls_update_policies` | Correção de políticas RLS |
| `20260430000001_fix_view_bdi` | Correção da view com cálculo BDI |
| `20260430000002_hierarchy_tables` | Tabelas de hierarquia |
| `20260504000000_bases` | Tabela `tabela_bases` para bases de referência (SINAPI, SUDECAP etc.) |
| `20260504000001_fix_view_bases` | Correção de view após introdução de bases |
| `20260505000000_ultimo_acesso` | Coluna `ultimo_acesso` em `tabela_orcamentos` |
| `20260505000001_tabela_logs` | Tabela de auditoria de operações (legada, ver `historico_alteracoes`) |
| `20260505000002_base_origem` | Coluna `base_origem` (origem declarada dos dados importados) |
| `20260506000000_orcamento_insumos_composicoes` | Tabelas `orcamento_composicoes` e `orcamento_insumos` |
| `20260506100000_composicao_custo` | Coluna `composicao_id` (nullable) em `orcamento_insumos` |
| `20260506200000_itens_composicao_propria` | Permite item da planilha referenciar composição própria do orçamento |
| `20260508000000_add_indice_to_insumos` | Coluna `indice` em `orcamento_insumos` |
| `20260508100000_add_grupo_to_insumos` | Coluna `grupo` (H/M/E/S/T) em `orcamento_insumos` |
| `20260508200000_orcamento_estrutura` | Tabela `orcamento_estrutura` (planilha hierárquica) |
| `20260513000000_clone_orcamento_fn` | Função PostgreSQL para clonar orçamento completo |
| `20260513000001_clone_orcamento_bulk` | Versão em lote da clonagem (performance) |
| `20260513000002_custo_atualizado_em` | Timestamp de última atualização de custo por insumo + trigger automático |
| `20260514000000_bdi_especifico_estrutura` | Coluna `bdi_especifico` na estrutura do orçamento |
| `20260514000001_orcamentos_created_at` | Coluna `created_at` em `tabela_orcamentos` |
| `20260610000000_resumo_geral_orcamento` | Colunas de área (`area_total`/`area_coberta`/`area_equivalente`) p/ custo/m² no Caderno |
| `20260611000000_orcamento_local` | Coluna `local` (cidade/UF) exibida no Caderno de Orçamento |
| `20260612000000_orcamento_numeracao` | Coluna `numeracao_digitos` (configuração de zero-padding da numeração) |
| `20260612000001_categorias_grafico` | Coluna `categorias_grafico` (mapeamento de grupos p/ gráfico de distribuição de custos) |
| `20260619000000_fix_numeric_overflow_views` | Corrige overflow numérico nas views; garante idempotência de migrações anteriores |
| `20260625000001_historico_precos` | Tabela `tabela_historico_precos` (auditoria de preço na biblioteca global de insumos) |
| `20260701000000_planilhas_multiplas` | Tabela `orcamento_planilhas` — suporte a múltiplas planilhas por orçamento |
| `20260701000001_composicao_custo_calculado` | Colunas `custo_unitario`/`calculado_em` em `orcamento_composicoes` (delta detection) |
| `20260702000000_planilha_totais_invalidacao` | Totais persistidos e invalidação por planilha (`total_custo`, `total_com_bdi`, `invalidado_em`) |
| `20260702000001_soft_delete` | Colunas `deleted_at`/`deleted_by` em composições/insumos ("Calcular e Limpar Projeto") |
| `20260702000002_orcamento_logs` | Tabela `orcamento_logs` (legada, ver `historico_alteracoes`) |
| `20260706000000_orcamento_versoes` | Tabela `orcamento_versoes` — versionamento (commits) do orçamento |
| `20260707000000_sufixo_projeto` | Trigger de código exclusivo por projeto (sufixo) — **revertido**, ver abaixo |
| `20260707000001_prefixo_projeto` | Corrige sufixo → prefixo (`ABC-88316`) — **revertido**, ver abaixo |
| `20260708000000_historico_alteracoes` | Tabela `historico_alteracoes` — auditoria unificada, substitui `tabela_logs`/`orcamento_logs` |
| `20260708010000_remove_prefixo_projeto` | Reverte o prefixo automático de código por projeto (trigger só agia em `INSERT`, causando inconsistência entre código avulso e código já usado em composições/planilha) |

> Código exclusivo por projeto (`20260707000000`/`20260707000001`) foi implementado e depois **revertido** (`20260708010000`): o trigger só prefixava novos `INSERT`s, então o mesmo insumo podia ter código prefixado em um lugar e sem prefixo em outro, quebrando o match de preço avulso. `codigo_original` permanece nas tabelas por compatibilidade, mas não é mais preenchido.

### Views SQL relevantes

- `vw_custo_composicao` — custo unitário calculado de cada composição (`SUM(indice × preco_base)`)
- `vw_total_orcamento` — total do orçamento sem e com BDI

---

## Formatos de importação suportados

### Planilha orçamentária (estrutura)

Aceita `.xlsx`, `.xls`, `.ods`, `.csv` (separador `;`).

Colunas esperadas (detecção automática por cabeçalho):

```
ITEM | CÓDIGO | DESCRIÇÃO | UND | QTDE | R$ UNIT.
```

- Linhas sem código → capítulos/grupos
- Numeração hierárquica: `1`, `1.1`, `1.1.1`
- Valores em formato brasileiro: `R$ 1.800,00`

### Base própria / SUDECAP (composições analíticas — importação flexível em `/orcamentos/[id]/importar`)

Aceita `.xlsx`, `.xls`, `.ods`, `.csv`. Formato com cabeçalho:

```
Codigo | DescricaoAbreviada | Unidade | ProducaoEquipe | OrigemComposicao |
TipoItemComposicao | CódigoDoInsumo/ComposicaoAuxiliar | DescricaoAbreviadaInsumo/ComposicaoAuxiliar |
UnidadeInsumo/ComposicaoAux | Indice | GrupoDoInsumo | OrigemInsumosComposicoesAuxiliares
```

- `TipoItemComposicao = I` → insumo direto
- `TipoItemComposicao = C` → sub-composição auxiliar
- `GrupoDoInsumo`: `H` = mão de obra, `M` = material, `E` = equipamento, `S` = serviço/subempreitada, `T` = transporte

O parser (`src/app/(app)/orcamentos/[id]/importar/import-form.tsx`) detecta as colunas pelo nome do cabeçalho (com fallback para posição fixa), tolerando variações de acentuação, espaços e capitalização. Também detecta automaticamente os formatos SUDECAP "Relatório de Composições" e DNIT/SICRO.

### SINAPI analítico

Formato com colunas `Código da Composição` + `Código do Item`. Linha pai tem `Código do Item` vazio; linhas filhas têm `Código do Item` preenchido.

### Lista plana de insumos (IS*)

Cada linha = um insumo. Colunas: `codigo, descricao, unidade, custo, grupo, data_ref`.

### Modelo de Composições (posição fixa — `/composicoes/importar` e biblioteca global)

Formato usado pelo botão "Exportar modelo" (`src/components/export-composicao-modelo-button.tsx`) e pelo importador de composições da biblioteca global (`src/app/(app)/composicoes/importar/page.tsx`), com posições de coluna fixas (0-indexed):

```
Codigo | DescricaoAbreviada | Unidade | TipoItemComposicao | CodigoDoInsumo |
DescricaoAbreviadaInsumo | UnidadeInsumo | Indice | GrupoDoInsumo
```

- Os 3 primeiros campos (código/descrição/unidade da composição) só são lidos na **primeira linha** de cada serviço — nas linhas seguintes (mesma composição, outro insumo) ficam em branco ("carry-forward").
- `TipoItemComposicao`: em branco = insumo normal; `C` = sub-composição auxiliar (importada como um insumo cujo código coincide com o de outra composição — o motor de cálculo, Curva ABC e Planilha Analítica Decomposta reconhecem esse padrão e decompõem recursivamente).
- Insumos ausentes na base do usuário são criados automaticamente com preço `0` e `fonte = BASE_PROPRIA`; composições com código já existente são ignoradas (não sobrescreve).

---

## Estrutura de arquivos

```
FS-Orcamento/
├── src/
│   ├── app/
│   │   ├── (app)/                      # Grupo de rotas autenticadas
│   │   │   ├── dashboard/
│   │   │   │   └── widgets/            # Widgets independentes (Server Components + Suspense)
│   │   │   ├── orcamentos/
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── layout.tsx      # Breadcrumb + subnav do orçamento
│   │   │   │   │   ├── planilha/       # Planilha hierárquica (multi-planilha), motor de cálculo
│   │   │   │   │   ├── insumos/        # Tabela de preços do orçamento
│   │   │   │   │   ├── composicoes/    # Composições do orçamento (add/edit insumo, preço, índice)
│   │   │   │   │   ├── curva-abc/      # Análise ABC em abas por categoria
│   │   │   │   │   ├── relatorios/     # Exportações XLSX/PDF
│   │   │   │   │   ├── caderno/        # Caderno de Orçamento (PDF, 11 seções)
│   │   │   │   │   ├── versoes/        # Versionamento (commits)
│   │   │   │   │   ├── configuracoes/  # BDI, numeração, áreas, categorias do gráfico
│   │   │   │   │   ├── logs/           # Histórico de alterações do orçamento
│   │   │   │   │   └── importar/       # Importação flexível (SUDECAP/SINAPI/DNIT/simples)
│   │   │   │   └── novo/
│   │   │   ├── insumos/                # Biblioteca global de insumos
│   │   │   ├── composicoes/            # Biblioteca global de composições (+ /importar modelo)
│   │   │   ├── bases/                  # Gerenciamento de bases de referência
│   │   │   ├── projetos/
│   │   │   └── logs/                   # Histórico de alterações global
│   │   ├── auth/                       # Callbacks de autenticação
│   │   ├── login/
│   │   ├── signup/
│   │   ├── api/auth/                   # Endpoints de auth (Azure SSO)
│   │   ├── layout.tsx                  # Root layout
│   │   └── page.tsx                    # Redirect → /dashboard
│   ├── components/                     # Componentes reutilizáveis
│   │   ├── nav.tsx
│   │   ├── sidebar-shell.tsx
│   │   ├── orcamento-subnav.tsx
│   │   ├── client-pagination.tsx
│   │   ├── editable-cell.tsx
│   │   ├── export-composicao-modelo-button.tsx
│   │   └── ...
│   └── lib/
│       ├── supabase/
│       │   ├── client.ts               # Cliente browser (componentes client)
│       │   └── server.ts               # Cliente server (RSC + Server Actions)
│       ├── orcamento/
│       │   ├── types.ts                # Interfaces TypeScript
│       │   ├── insumos.ts              # Queries de insumos + upsertAvulsoInsumo
│       │   ├── composicoes.ts          # Queries de composições
│       │   ├── motor-calculo.ts        # Motor de cálculo (delta/força), consistência, órfãos
│       │   ├── planilhas.ts            # CRUD de orcamento_planilhas
│       │   ├── versoes.ts              # Snapshot/restauração de versões
│       │   ├── caderno.ts              # Agregação de dados p/ Caderno de Orçamento
│       │   ├── categorias-grafico.ts   # Categorias do gráfico de distribuição de custos
│       │   ├── duplicate.ts            # Duplicação de orçamento
│       │   └── parsing.ts              # parseNumero/inferirNivel compartilhados
│       ├── pdf/
│       │   ├── charts.ts               # KPI cards, donut chart (jsPDF vetorial)
│       │   └── abc-section.ts          # Seção Curva ABC reutilizável nos PDFs
│       ├── curva-abc.ts                # Cálculo e classificação A/B/C
│       ├── costs.ts                    # Utilitários de cálculo de custo
│       ├── log.ts                      # registrarHistorico (auditoria unificada)
│       ├── historico-labels.ts         # Labels/cores de ações do histórico
│       └── auth/
│           └── validate-domain.ts      # Restrição de domínio
├── supabase/
│   └── migrations/                     # Migrações SQL em ordem cronológica (ver tabela acima)
├── public/
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Decisões de design relevantes

### Por que Server Components em vez de API Routes?

Server Components eliminam a camada de API para leitura de dados, reduzindo latência e simplificando o código. Não há serialização/desserialização desnecessária — os dados chegam ao HTML diretamente do banco.

### Por que mutações mistas (Server Actions + cliente direto)?

Server Actions são usadas para operações que exigem revalidação de cache Next.js (ex.: salvar planilha, importar composições). Para edições de alta frequência por célula (ex.: custo de insumo), o cliente Supabase no browser evita o overhead de uma chamada de servidor e a consequente re-renderização do RSC, resultando em UX mais fluida.

### Por que isolamento de dados por `orcamento_id`?

Composições e insumos são copiados para dentro do orçamento (`orcamento_composicoes`, `orcamento_insumos`) em vez de referenciar a biblioteca global. Isso garante que alterações na biblioteca não afetem orçamentos já fechados e permite personalização de custos por orçamento.

### Limit de Server Action: 10 MB

Configurado em `next.config.ts` para suportar upload de planilhas grandes (.xlsx com centenas de composições).

---

*Sistema desenvolvido pela FS Consultores — uso interno.*
