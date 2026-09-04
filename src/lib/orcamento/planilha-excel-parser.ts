import type { EstruturaRow } from '@/app/(app)/orcamentos/[id]/planilha/planilha-import-action'

/**
 * Parser de Excel/CSV pra estrutura de planilha (EAP) — compartilhado entre
 * a Importação (import-planilha-form.tsx) e a Conferência de Importação
 * (conferencia-excel-form.tsx). Extraído de dentro do form de importação
 * pra garantir que os dois usam EXATAMENTE a mesma leitura — nenhuma lógica
 * de parsing duplicada entre "importar" e "conferir".
 */

// ─── Campos do sistema e mapeamento de colunas ───────────────────────────────
// Em vez de assumir posição fixa de coluna (a planilha do usuário pode ter
// colunas extras no meio, tipo "codLink"/"Referência"), cada coluna do
// arquivo é mapeada explicitamente pro campo do sistema que ela representa —
// ou "Não usar", pra colunas que não interessam.

export type CampoAlvo = 'numero' | 'codigo' | 'descricao' | 'unidade' | 'quantidade' | 'custo_unitario'
export type Mapeamento = Record<CampoAlvo, number | null>

export const CAMPOS: { key: CampoAlvo; label: string; obrigatorio?: boolean }[] = [
  { key: 'numero', label: 'Item (numeração)', obrigatorio: true },
  { key: 'codigo', label: 'Código' },
  { key: 'descricao', label: 'Descrição', obrigatorio: true },
  { key: 'unidade', label: 'Unidade' },
  { key: 'quantidade', label: 'Quantidade' },
  { key: 'custo_unitario', label: 'R$ Unitário' },
]

export const MAPEAMENTO_VAZIO: Mapeamento = { numero: null, codigo: null, descricao: null, unidade: null, quantidade: null, custo_unitario: null }

// Aliases pra sugestão automática — mesmo espírito do detectCols() usado na
// importação de Insumos/Composições, adaptado pros campos da Planilha.
const ALIASES: Record<CampoAlvo, string[]> = {
  numero:   ['item', 'no', 'nitem', 'numero', 'num', 'ordem'],
  codigo:   ['codigo', 'cod', 'code', 'codigodoservico', 'codigodoitem'],
  descricao:['descricao', 'descr', 'discriminacao', 'discriminacaodosservicos', 'servico', 'servicos', 'especificacao'],
  unidade:  ['unidade', 'und', 'un', 'unid', 'unidademedida'],
  quantidade:['quantidade', 'qtde', 'qtd', 'quant', 'quantidades'],
  custo_unitario: ['custo', 'valor', 'preco', 'runit', 'valorunit', 'precounit', 'custounit', 'punit',
                    'valorunitario', 'precounitario', 'custounitario', 'precvenda', 'rsunit', 'rsunitario'],
}

// ─── Helpers de parse ────────────────────────────────────────────────────────

export function parseBrNumber(s: unknown): number {
  const c = String(s ?? '').replace(/R\$\s*/g, '').trim()
  if (!c || c === '-' || c === '') return 0
  if (typeof s === 'number') return s
  return parseFloat(c.replace(/\./g, '').replace(',', '.')) || 0
}

export function normNum(n: string): string {
  // filter(Boolean) descarta segmentos vazios — planilhas reais costumam
  // escrever o item de nível 1 (capítulo) como "1." em vez de "1" (ver
  // planilha "Topo de Minas"). Sem o filtro, "1.".split('.') vira ["1",""],
  // e parseInt("") é NaN — o capítulo normalizava pra "1.NaN" em vez de "1",
  // caindo num nível (getLevel) diferente do de seus próprios filhos ("1.1"
  // normaliza certo pra "1.1") e quebrando toda a árvore pai/filho na
  // importação: capítulo e filhos ficavam "órfãos" (parent_id nulo) porque
  // as chaves de normalização nunca batiam entre si.
  return n.split('.').filter(Boolean).map(s => parseInt(s, 10).toString()).join('.')
}

export function getLevel(norm: string): number {
  return norm.split('.').length
}

function normCol(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/[^a-z0-9]/g, '')
}

function isSkipDescricao(desc: string): boolean {
  const d = desc.trim().toUpperCase()
  return (
    d.startsWith('TOTAL ITEM') ||
    d.startsWith('TOTAL DO ORÇAMENTO') ||
    d.startsWith('CUSTO/M2') ||
    d.startsWith('ÁREA COBERTA')
  )
}

// Header "de verdade" costuma estar nas primeiras linhas, mas pode vir
// precedido de linha(s) de título/capa — acha a linha com mais aparência de
// cabeçalho (contém "item" e algo de "descri"/"discrimina").
export function encontrarLinhaCabecalho(matrix: unknown[][]): number {
  for (let i = 0; i < Math.min(15, matrix.length); i++) {
    const joined = matrix[i].slice(0, 8).map(c => normCol(String(c ?? ''))).join(' ')
    if (joined.includes('item') && (joined.includes('descri') || joined.includes('discrimina'))) return i
  }
  return 0
}

export function sugerirMapeamento(header: string[]): Mapeamento {
  const mapa: Mapeamento = { ...MAPEAMENTO_VAZIO }
  header.forEach((h, i) => {
    const norm = normCol(h)
    for (const campo of Object.keys(ALIASES) as CampoAlvo[]) {
      if (mapa[campo] != null) continue
      if (ALIASES[campo].includes(norm)) mapa[campo] = i
    }
  })
  return mapa
}

export function pontuarMapeamento(mapa: Mapeamento): number {
  return Object.values(mapa).filter(v => v != null).length
}

/** Motivo pelo qual uma linha do arquivo não virou item/grupo — usado pela
 * Conferência pra mostrar "N linhas não reconhecidas" com o porquê, em vez
 * de descartar em silêncio como a importação faz hoje. */
export type MotivoLinhaIgnorada = 'vazia' | 'sem_numero' | 'numero_invalido' | 'sem_descricao' | 'linha_total'

export interface LinhaIgnorada {
  /** Linha na matriz bruta (0-based, inclui cabeçalho) — só pra referência interna. */
  linhaIndex: number
  motivo: MotivoLinhaIgnorada
  /** Resumo do conteúdo da linha (primeiras células não vazias), pro usuário reconhecer do que se trata. */
  amostra: string
}

const MOTIVO_LABEL: Record<MotivoLinhaIgnorada, string> = {
  vazia: 'Linha em branco',
  sem_numero: 'Sem valor na coluna de item/numeração',
  numero_invalido: 'Numeração em formato inesperado',
  sem_descricao: 'Sem descrição',
  linha_total: 'Linha de total/rodapé',
}
export function motivoLabel(m: MotivoLinhaIgnorada): string {
  return MOTIVO_LABEL[m]
}

function amostraDaLinha(row: unknown[]): string {
  return row
    .map(c => String(c ?? '').trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' | ') || '(linha em branco)'
}

/** Núcleo compartilhado: matriz de células + mapeamento de colunas →
 * EstruturaRow[] (linhas válidas) + LinhaIgnorada[] (linhas descartadas,
 * com o motivo). `startLine` pula a linha de cabeçalho (e qualquer coisa
 * antes dela). */
export function parseMatrix(matrix: unknown[][], mapa: Mapeamento, startLine: number): { rows: EstruturaRow[]; ignoradas: LinhaIgnorada[] } {
  const rows: EstruturaRow[] = []
  const ignoradas: LinhaIgnorada[] = []
  let ordem = 0
  const valor = (row: unknown[], campo: CampoAlvo): string => {
    const idx = mapa[campo]
    return idx == null ? '' : String(row[idx] ?? '').trim()
  }
  const ignorar = (i: number, row: unknown[], motivo: MotivoLinhaIgnorada) => {
    ignoradas.push({ linhaIndex: i, motivo, amostra: amostraDaLinha(row) })
  }

  for (let i = startLine; i < matrix.length; i++) {
    const row = matrix[i]
    if (!row || row.every(c => !String(c ?? '').trim())) { if (row) ignorar(i, row, 'vazia'); continue }

    const numero = valor(row, 'numero')
    if (!numero) { ignorar(i, row, 'sem_numero'); continue }
    if (!/^[\d.]+$/.test(numero)) { ignorar(i, row, 'numero_invalido'); continue }

    const descricao = valor(row, 'descricao')
    if (!descricao) { ignorar(i, row, 'sem_descricao'); continue }
    if (isSkipDescricao(descricao)) { ignorar(i, row, 'linha_total'); continue }

    const norm = normNum(numero)
    const nivel = getLevel(norm)
    const codigo = valor(row, 'codigo') || null
    const tipo: 'grupo' | 'item' = !codigo ? 'grupo' : 'item'

    const unidadeStr = valor(row, 'unidade')
    const quantidadeStr = valor(row, 'quantidade')
    const custoIdx = mapa.custo_unitario

    rows.push({
      numero,
      nivel,
      codigo,
      descricao,
      unidade: tipo === 'grupo' ? null : (unidadeStr || null),
      quantidade: tipo === 'grupo' || !quantidadeStr ? null : (parseBrNumber(row[mapa.quantidade!]) || null),
      custo_unitario: tipo === 'grupo' || custoIdx == null ? null : (parseBrNumber(row[custoIdx]) || null),
      tipo,
      ordem: ordem++,
    })
  }

  return { rows, ignoradas }
}

export interface AbaBruta {
  nome: string
  matrix: unknown[][]
  linhaCabecalho: number
  header: string[]
}

export function construirAba(nome: string, matrix: unknown[][]): AbaBruta {
  const linhaCabecalho = encontrarLinhaCabecalho(matrix)
  const header = (matrix[linhaCabecalho] ?? []).map(c => String(c ?? '').trim())
  return { nome, matrix, linhaCabecalho, header }
}

export async function parseXlsxTodasAbas(ab: ArrayBuffer): Promise<{ abas: AbaBruta[]; melhorIndice: number }> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(ab, { type: 'array', cellDates: false })

  const abas: AbaBruta[] = wb.SheetNames.map(nome => {
    const ws = wb.Sheets[nome]
    const matrix = ws ? (XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]) : []
    return construirAba(nome, matrix)
  })

  // Aba "melhor" = a que tem mais campos reconhecidos automaticamente no
  // cabeçalho (sinal mais forte que "mais linhas", que uma aba de capa/resumo
  // também pode ter).
  let melhorIndice = 0
  let melhorScore = pontuarMapeamento(sugerirMapeamento(abas[0]?.header ?? []))
  for (let i = 1; i < abas.length; i++) {
    const score = pontuarMapeamento(sugerirMapeamento(abas[i].header))
    if (score > melhorScore) { melhorScore = score; melhorIndice = i; }
  }

  return { abas, melhorIndice }
}

export function matrixFromCsv(text: string): unknown[][] {
  const cleaned = text.replace(/^﻿/, '')
  const lines = cleaned.split(/\r?\n/)
  return lines.map(line => line.split(';').map(c => c.trim().replace(/^"|"$/g, '')))
}

/** Lê um arquivo (.xlsx/.xls/.ods/.csv/.txt) e devolve todas as abas já
 * processadas — mesmo caminho usado pela Importação e pela Conferência. */
export async function lerArquivoPlanilha(file: File): Promise<{ abas: AbaBruta[]; melhorIndice: number }> {
  const ab = await file.arrayBuffer()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

  if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
    return parseXlsxTodasAbas(ab)
  }
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(ab)
  const text = utf8.includes('�') ? new TextDecoder('windows-1252').decode(ab) : utf8
  return { abas: [construirAba('arquivo', matrixFromCsv(text))], melhorIndice: 0 }
}
