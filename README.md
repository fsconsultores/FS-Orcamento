# FS-Orcamento

Sistema de orçamentação de obras para a FS Consultores. Permite elaborar, gerenciar e analisar orçamentos de construção civil com estrutura hierárquica de serviços, insumos e composições analíticas, com análise de Curva ABC e exportação para XLSX.

---

## Sumário

- [Stack tecnológico](#stack-tecnológico)
- [Arquitetura](#arquitetura)
- [Modelo de dados](#modelo-de-dados)
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
| Planilhas | xlsx / xlsx-js-style | 0.18 / 1.2 |

---

## Arquitetura

### Modelo de execução

A aplicação usa exclusivamente o **Next.js App Router** com o padrão Server Components + Server Actions:

- **Server Components** buscam dados diretamente do Supabase no servidor, sem round-trip de API. Nenhum dado é exposto via REST/GraphQL customizado.
- **Server Actions** (`'use server'`) executam mutações (insert, update, delete) e chamam `revalidatePath` para invalidar o cache do Next.js após cada operação.
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
  id, user_id, codigo, nome_obra, cliente, data,
  bdi_global, ultimo_acesso, created_at

orcamento_composicoes          (cópia local de composições para o orçamento)
  id, orcamento_id, codigo, descricao, unidade, base

orcamento_insumos              (insumos dentro de composições OU avulsos)
  id, orcamento_id, composicao_id (nullable), codigo,
  descricao, unidade, custo, indice, grupo, base, data_ref

orcamento_estrutura            (planilha orçamentária hierárquica)
  id, orcamento_id, parent_id (self-ref), numero, nivel,
  codigo, descricao, unidade, quantidade, custo_unitario,
  bdi_especifico, tipo (grupo|item), ordem
```

### Regras de negócio principais

- Um **insumo avulso** tem `composicao_id IS NULL`. Um insumo dentro de uma composição tem `composicao_id` preenchido.
- A **planilha** (`orcamento_estrutura`) é hierárquica: itens com `tipo = 'grupo'` são capítulos/seções; itens com `tipo = 'item'` são serviços ou insumos diretos.
- O **BDI** pode ser global (campo `bdi_global` no orçamento) ou específico por item (`bdi_especifico` na estrutura). O item específico tem precedência.
- **Custo de composição** é calculado em tempo real: `SUM(insumo.custo × insumo.indice)`.

---

## Módulos da aplicação

### Dashboard (`/dashboard`)
Listagem de todos os orçamentos do usuário com acesso rápido, data de último acesso e totais.

### Orçamentos (`/orcamentos`)
CRUD completo de orçamentos. Cada orçamento agrupa:

| Sub-rota | Descrição |
|---|---|
| `/planilha` | Planilha orçamentária hierárquica (grupos + itens). Edição inline. Importação CSV/XLSX. |
| `/insumos` | Tabela de preços do orçamento. Edição de custo com navegação estilo Excel (Enter avança linha). |
| `/composicoes` | Composições analíticas vinculadas ao orçamento com seus insumos e coeficientes. |
| `/curva-abc` | Análise ABC por **Serviços** (composições com sub-itens) e por **Insumos** (materiais/mão-de-obra expandidos). |
| `/importar` | Importação de insumos e composições a partir de arquivos XLSX/CSV. |

**Clonagem de orçamento:** função PostgreSQL `clone_orcamento` copia toda a estrutura (composições, insumos, planilha) para um novo orçamento.

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
| `20260505000001_tabela_logs` | Tabela de auditoria de operações |
| `20260506000000_orcamento_insumos_composicoes` | Tabelas `orcamento_composicoes` e `orcamento_insumos` |
| `20260508000000_add_indice_to_insumos` | Coluna `indice` em `orcamento_insumos` |
| `20260508100000_add_grupo_to_insumos` | Coluna `grupo` (H/M/E/S/T) em `orcamento_insumos` |
| `20260508200000_orcamento_estrutura` | Tabela `orcamento_estrutura` (planilha hierárquica) |
| `20260513000000_clone_orcamento_fn` | Função PostgreSQL para clonar orçamento completo |
| `20260513002_custo_atualizado_em` | Timestamp de última atualização de custo por insumo |
| `20260514000000_bdi_especifico_estrutura` | Coluna `bdi_especifico` na estrutura do orçamento |

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

### Base própria / SUDECAP (composições analíticas)

Aceita `.xlsx`, `.xls`, `.ods`, `.csv`. Formato com cabeçalho:

```
Codigo | DescricaoAbreviada | Unidade | ProducaoEquipe | OrigemComposicao |
TipoItemComposicao | CódigoDoInsumo/ComposicaoAuxiliar | DescricaoAbreviadaInsumo/ComposicaoAuxiliar |
UnidadeInsumo/ComposicaoAux | Indice | GrupoDoInsumo | OrigemInsumosComposicoesAuxiliares
```

- `TipoItemComposicao = I` → insumo direto
- `TipoItemComposicao = C` → sub-composição auxiliar
- `GrupoDoInsumo`: `H` = mão de obra, `M` = material, `E` = equipamento, `S` = serviço/subempreitada, `T` = transporte

O parser detecta as colunas pelo nome do cabeçalho (com fallback para posição fixa), tolerando variações de acentuação, espaços e capitalização.

### SINAPI analítico

Formato com colunas `Código da Composição` + `Código do Item`. Linha pai tem `Código do Item` vazio; linhas filhas têm `Código do Item` preenchido.

### Lista plana de insumos (IS*)

Cada linha = um insumo. Colunas: `codigo, descricao, unidade, custo, grupo, data_ref`.

---

## Estrutura de arquivos

```
FS-Orcamento/
├── src/
│   ├── app/
│   │   ├── (app)/                      # Grupo de rotas autenticadas
│   │   │   ├── dashboard/
│   │   │   ├── orcamentos/
│   │   │   │   ├── [id]/
│   │   │   │   │   ├── layout.tsx      # Breadcrumb + subnav do orçamento
│   │   │   │   │   ├── planilha/       # Planilha hierárquica
│   │   │   │   │   ├── insumos/        # Tabela de preços
│   │   │   │   │   ├── composicoes/    # Composições analíticas
│   │   │   │   │   ├── curva-abc/      # Análise ABC
│   │   │   │   │   └── importar/       # Importação de dados
│   │   │   │   └── novo/
│   │   │   ├── insumos/                # Biblioteca global de insumos
│   │   │   ├── composicoes/            # Biblioteca global de composições
│   │   │   ├── bases/                  # Gerenciamento de bases de referência
│   │   │   ├── projetos/
│   │   │   └── logs/
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
│   │   └── ...
│   └── lib/
│       ├── supabase/
│       │   ├── client.ts               # Cliente browser (componentes client)
│       │   └── server.ts               # Cliente server (RSC + Server Actions)
│       ├── orcamento/
│       │   ├── types.ts                # Interfaces TypeScript
│       │   ├── insumos.ts              # Queries de insumos
│       │   └── composicoes.ts          # Queries de composições
│       ├── curva-abc.ts                # Cálculo e classificação A/B/C
│       ├── costs.ts                    # Utilitários de cálculo de custo
│       └── auth/
│           └── validate-domain.ts      # Restrição de domínio
├── supabase/
│   └── migrations/                     # 24 migrações SQL em ordem cronológica
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
