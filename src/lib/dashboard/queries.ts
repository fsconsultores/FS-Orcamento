import { unstable_cache } from 'next/cache'

// Mesmo padrão do resto do projeto: tipos gerados (src/lib/supabase/types.ts)
// estão desatualizados frente ao schema real, então as queries usam `as any`.
type SB = any

export interface OrcamentoResumo {
  id: string
  nome_obra: string
  cliente: string | null
  codigo: string | null
  data: string | null
  ultimo_acesso: string | null
  created_at: string
}

export interface PlanilhaResumo {
  id: string
  orcamento_id: string
  total_custo: number | null
  total_com_bdi: number | null
  bdi_global: number | null
  invalidado_em: string | null
  ultima_calculo_em: string | null
}

export interface VersaoResumo {
  id: string
  orcamento_id: string
  criado_em: string
}

export interface EstruturaItemResumo {
  orcamento_id: string
  codigo: string | null
  descricao: string
  unidade: string | null
  quantidade: number
  custo_unitario: number
}

export interface AtividadeResumo {
  id: string
  acao: string
  entidade: string | null
  mensagem: string
  created_at: string
  orcamento_id: string | null
}

export interface BaseResumo {
  base_id: string
  nome: string
  orgao: string
  tipo_base: 'externa' | 'propria'
  total_insumos: number
  total_composicoes: number
  ultima_importacao: string | null
}

export interface ResumoSistema {
  total_insumos_globais: number
  total_composicoes_globais: number
  total_equipamentos: number
  total_mao_de_obra: number
  total_servicos: number
  total_materiais: number
  total_insumos_sem_preco: number
  total_composicoes_incompletas: number
}

/** Orçamentos do usuário logado (RLS já filtra) — alimenta KPI "Projetos ativos",
 * "Projetos Recentes" e a base de dados dos Alertas. */
export async function getOrcamentosResumo(sb: SB): Promise<OrcamentoResumo[]> {
  const { data } = await sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, cliente, codigo, data, ultimo_acesso, created_at')
    .order('ultimo_acesso', { ascending: false, nullsFirst: false })
  return data ?? []
}

/** Todas as planilhas de todos os orçamentos do usuário (RLS já filtra) — um
 * orçamento pode ter mais de uma. Alimenta valor total, status calculado e
 * alertas de BDI/cálculo desatualizado. */
export async function getPlanilhasResumo(sb: SB): Promise<PlanilhaResumo[]> {
  const { data } = await sb
    .from('orcamento_planilhas')
    .select('id, orcamento_id, total_custo, total_com_bdi, bdi_global, invalidado_em, ultima_calculo_em')
  return data ?? []
}

/** Só id/orcamento_id/criado_em — nunca a coluna `snapshot` (jsonb pesada).
 * Alimenta o alerta "planilha sem versão salva". */
export async function getVersoesResumo(sb: SB): Promise<VersaoResumo[]> {
  const { data } = await sb
    .from('orcamento_versoes')
    .select('id, orcamento_id, criado_em')
  return data ?? []
}

/** Itens (não grupos) de todas as planilhas do usuário — sem decompor
 * sub-composições. Alimenta a Curva ABC Geral e o total de "itens orçados". */
export async function getEstruturaItens(sb: SB): Promise<EstruturaItemResumo[]> {
  const { data } = await sb
    .from('orcamento_estrutura')
    .select('orcamento_id, codigo, descricao, unidade, quantidade, custo_unitario')
    .eq('tipo', 'item')
  return data ?? []
}

/** Janela de atividade maior que o exibido (8 grupos) porque a agregação em
 * JS colapsa várias linhas por grupo — precisa de matéria-prima suficiente. */
export async function getAtividadesRecentes(sb: SB, userId: string): Promise<AtividadeResumo[]> {
  const { data } = await sb
    .from('historico_alteracoes')
    .select('id, acao, entidade, mensagem, created_at, orcamento_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(60)
  return data ?? []
}

/** Bases externas (SINAPI/DNIT/SUDECAP/DER) são dado global (RLS libera
 * SELECT para qualquer authenticated, sem depender de user_id) — cache real
 * compartilhado entre todos os usuários é seguro aqui (chave fixa, sem
 * argumentos por-usuário). Mesmo `sb` (com cookies da requisição) do padrão
 * já usado em bases/page.tsx — o resultado não depende de quem pergunta. */
export async function getBasesExternasResumo(sb: SB): Promise<BaseResumo[]> {
  const cached = unstable_cache(
    async () => {
      const { data } = await sb
        .from('vw_bases_resumo')
        .select('base_id, nome, orgao, tipo_base, total_insumos, total_composicoes, ultima_importacao')
        .eq('tipo_base', 'externa')
      return (data ?? []) as BaseResumo[]
    },
    ['dashboard-bases-externas'],
    { revalidate: 300, tags: ['bases-contagens'] }
  )
  return cached()
}

/** Base própria do usuário logado — por-usuário, NUNCA envolver em
 * unstable_cache (vazaria contagens entre usuários). Se o usuário ainda não
 * criou a base própria, retorna null (dashboard mostra 0, sem custo de RPC
 * get_or_create_propria_base — só necessária no fluxo de import). */
export async function getBasePropriaResumo(sb: SB): Promise<BaseResumo | null> {
  const { data } = await sb
    .from('vw_bases_resumo')
    .select('base_id, nome, orgao, tipo_base, total_insumos, total_composicoes, ultima_importacao')
    .eq('tipo_base', 'propria')
    .maybeSingle()
  return data ?? null
}

/** Totais da biblioteca global (insumos/composições por categoria, itens sem
 * preço, composições incompletas) — dado verdadeiramente global, seguro para
 * unstable_cache com chave fixa. */
export async function getResumoSistema(sb: SB): Promise<ResumoSistema | null> {
  const cached = unstable_cache(
    async () => {
      const { data } = await sb.from('vw_resumo_sistema').select('*').maybeSingle()
      return data ?? null
    },
    ['dashboard-resumo-sistema'],
    { revalidate: 300, tags: ['resumo-sistema'] }
  )
  return cached()
}
