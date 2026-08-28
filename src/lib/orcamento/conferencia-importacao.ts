import type { EstruturaRow } from '@/app/(app)/orcamentos/[id]/planilha/planilha-import-action'
import { normNum, getLevel } from './planilha-excel-parser'

/**
 * Conferência de Importação — compara um Excel reenviado (a qualquer
 * momento, não só logo após importar) contra o estado ATUAL de
 * orcamento_estrutura, sem persistir nada novo. Casa por `numero` (chave
 * natural já presente nos dois lados) e valida conteúdo em cada par —
 * nunca usa "mesma quantidade de linhas" como prova de nada.
 */

export interface ItemOrcamentoParaConferencia {
  id: string
  numero: string
  descricao: string
  unidade: string | null
  quantidade: number | null
  nivel: number
  ordem: number
}

export type StatusItemConferencia =
  | 'confere' | 'diferenca' | 'ausente' | 'sobrando' | 'duplicado_excel' | 'duplicado_orcamento'

export interface CampoDivergente {
  campo: 'descricao' | 'unidade' | 'quantidade' | 'estrutura'
  valorExcel: string | number | null
  valorOrcamento: string | number | null
}

export interface ItemConferencia {
  numero: string
  status: StatusItemConferencia
  descricaoExcel: string | null
  descricaoOrcamento: string | null
  divergencias: CampoDivergente[]
  /** orcamento_estrutura.id, quando o item existe no orçamento — usado pra navegação. */
  itemId: string | null
  /** Casado com o Excel, mas em posição relativa diferente da esperada pela ordem de aparição no arquivo. */
  foraDeOrdem: boolean
}

export interface ResumoConferencia {
  confere: number
  diferenca: number
  ausente: number
  sobrando: number
  duplicado: number
  naoReconhecidas: number
}

export interface ResultadoConferencia {
  itens: ItemConferencia[]
  resumo: ResumoConferencia
}

function normTexto(s: string | null | undefined): string {
  return (s ?? '').trim().toUpperCase().replace(/\s+/g, ' ')
}

// Abreviações comuns de unidade não devem contar como divergência (M2 vs m²).
function normUnidade(s: string | null | undefined): string {
  return normTexto(s).replace(/[²]/g, '2').replace(/[³]/g, '3').replace(/\./g, '')
}

function quantidadesIguais(a: number | null, b: number | null): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) < 0.001
}

function ordenarPorNumero(itens: ItemConferencia[]): ItemConferencia[] {
  return [...itens].sort((a, b) => normNum(a.numero).localeCompare(normNum(b.numero), 'pt-BR', { numeric: true }))
}

export function compararComExcel(
  linhasExcel: EstruturaRow[],
  estruturaAtual: ItemOrcamentoParaConferencia[]
): ResultadoConferencia {
  const porNumeroExcel = new Map<string, EstruturaRow[]>()
  for (const r of linhasExcel) {
    const chave = normNum(r.numero)
    const arr = porNumeroExcel.get(chave) ?? []
    arr.push(r)
    porNumeroExcel.set(chave, arr)
  }

  const porNumeroOrcamento = new Map<string, ItemOrcamentoParaConferencia[]>()
  for (const it of estruturaAtual) {
    const chave = normNum(it.numero)
    const arr = porNumeroOrcamento.get(chave) ?? []
    arr.push(it)
    porNumeroOrcamento.set(chave, arr)
  }

  const todasChaves = new Set([...porNumeroExcel.keys(), ...porNumeroOrcamento.keys()])
  const itens: ItemConferencia[] = []

  for (const chave of todasChaves) {
    const doExcel = porNumeroExcel.get(chave) ?? []
    const doOrcamento = porNumeroOrcamento.get(chave) ?? []

    // Mesmo número aparece mais de uma vez em um dos lados — o próprio
    // casamento por número já fica ambíguo, então cada ocorrência entra
    // marcada como duplicata em vez de arriscar um casamento errado.
    if (doExcel.length > 1) {
      for (const e of doExcel) {
        itens.push({
          numero: e.numero, status: 'duplicado_excel',
          descricaoExcel: e.descricao, descricaoOrcamento: doOrcamento[0]?.descricao ?? null,
          divergencias: [], itemId: doOrcamento[0]?.id ?? null, foraDeOrdem: false,
        })
      }
      continue
    }
    if (doOrcamento.length > 1) {
      for (const o of doOrcamento) {
        itens.push({
          numero: o.numero, status: 'duplicado_orcamento',
          descricaoExcel: doExcel[0]?.descricao ?? null, descricaoOrcamento: o.descricao,
          divergencias: [], itemId: o.id, foraDeOrdem: false,
        })
      }
      continue
    }

    const e = doExcel[0]
    const o = doOrcamento[0]

    if (e && !o) {
      itens.push({ numero: e.numero, status: 'ausente', descricaoExcel: e.descricao, descricaoOrcamento: null, divergencias: [], itemId: null, foraDeOrdem: false })
      continue
    }
    if (o && !e) {
      itens.push({ numero: o.numero, status: 'sobrando', descricaoExcel: null, descricaoOrcamento: o.descricao, divergencias: [], itemId: o.id, foraDeOrdem: false })
      continue
    }
    if (e && o) {
      const divergencias: CampoDivergente[] = []
      if (normTexto(e.descricao) !== normTexto(o.descricao)) {
        divergencias.push({ campo: 'descricao', valorExcel: e.descricao, valorOrcamento: o.descricao })
      }
      if (e.tipo === 'item' && normUnidade(e.unidade) !== normUnidade(o.unidade)) {
        divergencias.push({ campo: 'unidade', valorExcel: e.unidade, valorOrcamento: o.unidade })
      }
      if (e.tipo === 'item' && !quantidadesIguais(e.quantidade, o.quantidade)) {
        divergencias.push({ campo: 'quantidade', valorExcel: e.quantidade, valorOrcamento: o.quantidade })
      }
      // Nível que a numeração do Excel implica != nível gravado no orçamento
      // para essa mesma linha — sinal de hierarquia corrompida/editada à parte.
      if (getLevel(normNum(e.numero)) !== o.nivel) {
        divergencias.push({ campo: 'estrutura', valorExcel: getLevel(normNum(e.numero)), valorOrcamento: o.nivel })
      }

      itens.push({
        numero: e.numero,
        status: divergencias.length > 0 ? 'diferenca' : 'confere',
        descricaoExcel: e.descricao, descricaoOrcamento: o.descricao,
        divergencias, itemId: o.id, foraDeOrdem: false,
      })
    }
  }

  // Fora de ordem: para pares casados 1-a-1, verifica se a posição no
  // orçamento é crescente na mesma sequência em que aparecem no Excel — uma
  // inversão isolada indica item deslocado. Não é uma LIS perfeita, é um
  // sinal (running-max sobre a ordem do Excel), suficiente pra apontar
  // "isso aqui não está onde deveria". Comparado por GRUPO DE IRMÃOS (mesmo
  // pai), não por ordem global: orcamento_estrutura.ordem é reiniciado a
  // cada novo grupo de irmãos pelas ações de CRUD da Planilha (ver
  // planilha-crud-action.ts, nextOrdem calculado por parent_id) — comparar
  // ordem bruta entre pais diferentes gera falso positivo.
  function paiDoNumero(numero: string): string {
    const partes = normNum(numero).split('.')
    return partes.length <= 1 ? '' : partes.slice(0, -1).join('.')
  }

  const paresCasados = itens
    .filter(it => it.itemId && it.status !== 'ausente' && it.status !== 'sobrando' && it.status !== 'duplicado_excel' && it.status !== 'duplicado_orcamento')
    .map(it => {
      const chave = normNum(it.numero)
      return {
        it,
        pai: paiDoNumero(it.numero),
        ordemExcel: porNumeroExcel.get(chave)?.[0]?.ordem ?? 0,
        ordemOrcamento: porNumeroOrcamento.get(chave)?.[0]?.ordem ?? 0,
      }
    })

  const porPai = new Map<string, typeof paresCasados>()
  for (const par of paresCasados) {
    const arr = porPai.get(par.pai) ?? []
    arr.push(par)
    porPai.set(par.pai, arr)
  }

  for (const irmaos of porPai.values()) {
    if (irmaos.length < 2) continue
    const porOrdemExcel = [...irmaos].sort((a, b) => a.ordemExcel - b.ordemExcel)
    let maiorOrdemVista = -1
    for (const par of porOrdemExcel) {
      if (par.ordemOrcamento < maiorOrdemVista) par.it.foraDeOrdem = true
      else maiorOrdemVista = par.ordemOrcamento
    }
  }

  const resumo: ResumoConferencia = {
    confere: itens.filter(i => i.status === 'confere' && !i.foraDeOrdem).length,
    diferenca: itens.filter(i => i.status === 'diferenca').length,
    ausente: itens.filter(i => i.status === 'ausente').length,
    sobrando: itens.filter(i => i.status === 'sobrando').length,
    duplicado: itens.filter(i => i.status === 'duplicado_excel' || i.status === 'duplicado_orcamento').length,
    naoReconhecidas: 0,
  }

  return { itens: ordenarPorNumero(itens), resumo }
}
