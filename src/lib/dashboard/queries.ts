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

export interface FavoritoRecenteItem {
  id: string
  entityType: 'insumo' | 'composicao' | 'orcamento'
  label: string
  sublabel: string | null
  href: string
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
 * "Projetos Recentes" e a base de dados dos Alertas. Exclui modelos (`is_modelo`)
 * — não são projetos reais, não devem entrar em KPIs/alertas/Curva ABC Geral. */
export async function getOrcamentosResumo(sb: SB): Promise<OrcamentoResumo[]> {
  const { data } = await sb
    .from('tabela_orcamentos')
    .select('id, nome_obra, cliente, codigo, data, ultimo_acesso, created_at')
    .eq('is_modelo', false)
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

export interface InsumoAvulsoResumo {
  orcamento_id: string
  grupo: string | null
  custo: number
}

/** Insumos avulsos (composicao_id null) de todos os orçamentos do usuário —
 * cada insumo aparece uma única vez por projeto nesse conjunto (cópias
 * embutidas em composições, uma por composição que usa o insumo, ficariam
 * de fora), então somar `custo` aqui não conta o mesmo preço em dobro.
 * Alimenta o widget "Insumos por categoria, por obra" do dashboard — ver
 * computeInsumosPorCategoria em curva-abc-geral.ts. */
export async function getInsumosAvulsosResumo(sb: SB): Promise<InsumoAvulsoResumo[]> {
  const { data } = await sb
    .from('orcamento_insumos')
    .select('orcamento_id, grupo, custo')
    .is('composicao_id', null)
  return data ?? []
}

export interface HistoricoPrecoResumo {
  orcamento_id: string
  codigo: string
  preco_anterior: number | null
  preco_novo: number
  created_at: string
}

/** Histórico de edição manual de preço de insumo, de todos os orçamentos do
 * usuário — a tabela só grava em edição manual (aba Insumos, Curva ABC,
 * Planilha Analítica), reimportação em massa de base não gera entrada de
 * propósito, então é pequena o bastante pra buscar tudo de uma vez. Alimenta
 * o widget "Maiores variações de preço" — ver computeMaioresVariacoes em
 * curva-abc-geral.ts. */
export async function getHistoricoPrecosResumo(sb: SB): Promise<HistoricoPrecoResumo[]> {
  const { data } = await sb
    .from('orcamento_insumo_historico_precos')
    .select('orcamento_id, codigo, preco_anterior, preco_novo, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
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

/** Favoritos mais recentes do usuário logado (insumos, composições, orçamentos
 * — bases ficam de fora, não fazem sentido no card "recentes utilizados").
 * Por-usuário, NUNCA envolver em unstable_cache (mesma regra de getBasePropriaResumo). */
export async function getFavoritosRecentes(sb: SB, userId: string): Promise<FavoritoRecenteItem[]> {
  const { data: favsRaw } = await sb
    .from('favoritos')
    .select('entity_type, entity_id, created_at')
    .eq('user_id', userId)
    .neq('entity_type', 'base')
    .order('created_at', { ascending: false })
    .limit(20)
  const favs = (favsRaw ?? []) as { entity_type: string; entity_id: string; created_at: string }[]
  if (favs.length === 0) return []

  const idsByType: Record<string, string[]> = {}
  for (const f of favs) (idsByType[f.entity_type] ??= []).push(f.entity_id)

  const [insumosRes, composicoesRes, orcamentosRes] = await Promise.all([
    idsByType.insumo?.length
      ? sb.from('tabela_insumos').select('id, codigo, descricao').in('id', idsByType.insumo)
      : Promise.resolve({ data: [] as any[] }),
    idsByType.composicao?.length
      ? sb.from('tabela_composicoes').select('id, codigo, descricao').in('id', idsByType.composicao)
      : Promise.resolve({ data: [] as any[] }),
    idsByType.orcamento?.length
      ? sb.from('tabela_orcamentos').select('id, nome_obra, codigo').in('id', idsByType.orcamento)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const insumoMap = new Map<string, any>((insumosRes.data ?? []).map((i: any) => [i.id, i]))
  const composicaoMap = new Map<string, any>((composicoesRes.data ?? []).map((c: any) => [c.id, c]))
  const orcamentoMap = new Map<string, any>((orcamentosRes.data ?? []).map((o: any) => [o.id, o]))

  const items: FavoritoRecenteItem[] = []
  for (const f of favs) {
    if (f.entity_type === 'insumo') {
      const i = insumoMap.get(f.entity_id)
      if (!i) continue
      items.push({ id: f.entity_id, entityType: 'insumo', label: i.descricao, sublabel: i.codigo, href: `/insumos/${f.entity_id}/editar` })
    } else if (f.entity_type === 'composicao') {
      const c = composicaoMap.get(f.entity_id)
      if (!c) continue
      items.push({ id: f.entity_id, entityType: 'composicao', label: c.descricao, sublabel: c.codigo, href: `/composicoes/${f.entity_id}` })
    } else if (f.entity_type === 'orcamento') {
      const o = orcamentoMap.get(f.entity_id)
      if (!o) continue
      items.push({ id: f.entity_id, entityType: 'orcamento', label: o.nome_obra, sublabel: o.codigo, href: `/orcamentos/${f.entity_id}` })
    }
    if (items.length >= 8) break
  }
  return items
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
