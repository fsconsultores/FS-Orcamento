import { ACAO_LABELS } from '@/lib/historico-labels'
import type { AtividadeResumo } from './queries'

/**
 * Allowlist de `acao` "dignas de aparecer" na Atividade Recente — exclui
 * ruído (limpezas, cálculos isolados, exclusões) conforme pedido: mostrar só
 * eventos relevantes, sem dezenas de exclusões repetidas.
 */
const ACOES_RELEVANTES = new Set([
  'atualizar_preco_insumo',
  'importar_sinapi',
  'importar_da_base',
  'importar_insumos',
  'importar_composicoes',
  'importar_planilha',
  'versao_criada',
  'versao_restaurada',
  'duplicar_orcamento',
  'criar_orcamento',
])

/** Rótulo plural usado quando >1 evento do mesmo tipo é agrupado — ex: "15 preços de insumo atualizados". */
const LABEL_PLURAL: Partial<Record<string, string>> = {
  atualizar_preco_insumo: 'preços de insumo atualizados',
  importar_sinapi: 'importações da SINAPI',
  importar_da_base: 'importações de base',
  importar_insumos: 'importações de insumos',
  importar_composicoes: 'importações de composições',
  importar_planilha: 'planilhas importadas',
  versao_criada: 'versões criadas',
  versao_restaurada: 'versões restauradas',
  duplicar_orcamento: 'orçamentos duplicados',
  criar_orcamento: 'orçamentos criados',
}

export interface AtividadeAgrupada {
  key: string
  acao: string
  count: number
  mensagem: string
  created_at: string
  orcamento_id: string | null
}

/**
 * Agrupa eventos idênticos (mesma ação, mesmo orçamento, mesma hora) num só
 * item — "15 preços atualizados" em vez de 15 linhas. Roda em memória sobre
 * a janela de ~60 linhas já buscada (`getAtividadesRecentes`); não é uma
 * agregação SQL porque o PostgREST não expõe GROUP BY flexível o bastante
 * para essa chave composta, e o volume aqui é pequeno.
 */
export function agruparAtividades(rows: AtividadeResumo[], limite = 8): AtividadeAgrupada[] {
  const grupos = new Map<string, AtividadeAgrupada>()

  for (const r of rows) {
    if (!ACOES_RELEVANTES.has(r.acao)) continue
    const hora = r.created_at.slice(0, 13) // "2026-07-17T14"
    const key = `${r.acao}__${r.orcamento_id ?? 'global'}__${hora}`
    const existente = grupos.get(key)
    if (existente) {
      existente.count += 1
      if (r.created_at > existente.created_at) existente.created_at = r.created_at
    } else {
      grupos.set(key, {
        key,
        acao: r.acao,
        count: 1,
        mensagem: r.mensagem,
        created_at: r.created_at,
        orcamento_id: r.orcamento_id,
      })
    }
  }

  return Array.from(grupos.values())
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limite)
}

/** Texto a exibir: mensagem original se o grupo tem 1 evento, resumo plural se tem mais. */
export function formatAtividadeLabel(a: AtividadeAgrupada): string {
  if (a.count === 1) return a.mensagem
  const plural = LABEL_PLURAL[a.acao] ?? (ACAO_LABELS[a.acao] ?? a.acao).toLowerCase()
  return `${a.count} ${plural}`
}
