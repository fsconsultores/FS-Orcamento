/**
 * Seção Resumo Geral — dashboard (pág. 1) + tabelas (A) e (B) (pág. 2+).
 */
import type { jsPDF } from 'jspdf'
import type { RowInput } from 'jspdf-autotable'
import { fmt, fmtQtd, fmtPct } from '@/lib/curva-abc'
import type {
  CadernoNode,
  DistribuicaoCustoItem,
  ServicoComInsumoEstimado,
  ServicoEstimado,
} from '@/lib/orcamento/caderno'
import { pareceEstimado } from '@/lib/orcamento/estimado-sugestao'
import { CADERNO_BRAND, PDF_COLORS } from './theme'
import { CADERNO_FONT } from './typography'
import { drawTop5HorizontalBarChart } from './charts'
import { drawCadernoKpiRow, CADERNO_KPI_PRIMARY, CADERNO_KPI_NEUTRAL } from './kpi'
import { globalTableStyles } from './global-table-styles'
import { pdfTableLayout, resumoDetalhamentoColumnStyles } from './table-layout'
import { standardHeaderAutoTableHooks, drawStandardHeader, type StandardHeaderData } from './standard-header'
import { addLandscapeA4Page } from './pdf-document'

export interface ResumoGeralDashboardInput {
  totalOrcadoA: number
  totalServicosEstimadosB: number
  areaTotal: number | null
  areaCoberta: number | null
  areaEquivalente: number | null
  distribuicaoCustos: DistribuicaoCustoItem[]
}

/** Dados das tabelas (A) e (B) — espelha CadernoData sem depender do exportador. */
export interface ResumoGeralTabelasInput {
  arvore: CadernoNode[]
  servicosEstimados: ServicoEstimado[]
  servicosComInsumoEstimado: ServicoComInsumoEstimado[]
  totalGeralComBdi: number
  totalServicosEstimados: number
  /** Pré-filtrado no exportador (export-caderno-pdf.ts) — mesma regra do PDF original. */
  servicosEstimadosVisiveis?: ServicoEstimado[]
}

export interface ResumoGeralTabelasOptions {
  incluirServicosComInsumoEstimado: boolean
  servicosComInsumoEstimadoOcultos: Set<string>
}

/** Resultado da separação (A) categorias padrão × (B) serviços estimados. */
export interface ResumoGeralSplitResult {
  categoriasA: CadernoNode[]
  servicosEstimados: ServicoEstimado[]
  totalOrcadoA: number
  totalServicosEstimadosB: number
}

/** Valor com BDI efetivo de um nó estimado — mesma regra do export-caderno-pdf.ts. */
function valorComBdiEfetivo(node: CadernoNode): number {
  if (node.estimado && node.valor_estimado != null) {
    return node.total > 0 ? node.valor_estimado * (node.totalComBdi / node.total) : node.valor_estimado
  }
  return node.totalComBdi
}

function cadernoNodeParaServicoEstimado(node: CadernoNode): ServicoEstimado {
  return {
    id: node.id,
    numero: node.numero,
    descricao: node.descricao,
    valor: valorComBdiEfetivo(node),
    itemPaiDescricao: null,
    estimadoMotivo: node.estimado_motivo,
  }
}

/**
 * Regra de negócio para classificar um nó da árvore como Serviço Estimado (B):
 * flag persistida, id já listado em B, insumo estimado, ou sufixo "- Estimado".
 */
export function isServicoEstimadoNode(
  node: CadernoNode,
  idsInsumoEstimado: Set<string>,
  idsServicosEstimados: Set<string>,
): boolean {
  if (node.estimado) return true
  if (node.id && idsInsumoEstimado.has(node.id)) return true
  if (node.id && idsServicosEstimados.has(node.id)) return true
  if (pareceEstimado(node.descricao)) return true
  return false
}

/**
 * Separa arrays (A) e (B) antes de renderizar — impede vazamento de estimados
 * para "(A) DETALHAMENTO DOS CUSTOS" e recalcula totais dos respectivos blocos.
 */
export function splitResumoGeralDados(input: ResumoGeralTabelasInput): ResumoGeralSplitResult {
  const idsInsumo = new Set((input.servicosComInsumoEstimado ?? []).map(s => s.id))
  const servicosFromData = resolveServicosEstimadosParaTabela(input)
  const idsServicos = new Set(servicosFromData.flatMap(s => (s.id ? [s.id] : [])))

  const categoriasA: CadernoNode[] = []
  const vazadosDeArvore: ServicoEstimado[] = []

  for (const node of input.arvore) {
    if (isServicoEstimadoNode(node, idsInsumo, idsServicos)) {
      vazadosDeArvore.push(cadernoNodeParaServicoEstimado(node))
      if (node.id) idsServicos.add(node.id)
    } else {
      categoriasA.push(node)
    }
  }

  const byId = new Map<string, ServicoEstimado>()
  const semId: ServicoEstimado[] = []

  for (const s of [...servicosFromData, ...vazadosDeArvore]) {
    if (s.id) {
      if (!byId.has(s.id)) byId.set(s.id, s)
    } else {
      semId.push(s)
    }
  }

  const servicosEstimados = [...byId.values(), ...semId]
  const totalOrcadoA = categoriasA.reduce((sum, n) => sum + n.totalComBdi, 0)
  const totalServicosEstimadosB = servicosEstimados.reduce((sum, s) => sum + s.valor, 0)

  const categoriasAComPct = categoriasA.map(n => ({
    ...n,
    percentualComBdi: totalOrcadoA > 0 ? (n.totalComBdi / totalOrcadoA) * 100 : 0,
  }))

  return {
    categoriasA: categoriasAComPct,
    servicosEstimados,
    totalOrcadoA,
    totalServicosEstimadosB,
  }
}

function drawHeroBar(doc: jsPDF, x: number, y: number, w: number, h: number, label: string, value: string, bg: string) {
  doc.setFillColor(bg)
  doc.rect(x, y, w, h, 'F')
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(CADERNO_FONT.heroLabel)
  doc.text(label, x + 4, y + h / 2 + 2)
  doc.setFontSize(CADERNO_FONT.heroValue)
  doc.text(value, x + w - 4, y + h / 2 + 2, { align: 'right' })
}

/** Título de seção acima da tabela — texto roxo, sem valor (total fica no rodapé). */
function drawResumoSectionTitle(
  doc: jsPDF,
  x: number,
  y: number,
  title: string,
): number {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(CADERNO_BRAND.primary)
  doc.text(title, x, y + 3.5)
  return y + 5.5
}

const RESUMO_DETALHAMENTO_HEAD: RowInput[] = [['Item', 'Descrição', 'Valor Geral (R$)', '% / Total']]

/**
 * Lista canônica de serviços estimados para a tabela (B).
 * Mescla data.servicosEstimados com servicosComInsumoEstimado (deduplicando por id)
 * para cobrir perdas de mapeamento na refatoração do renderizador.
 */
export function resolveServicosEstimadosParaTabela(input: ResumoGeralTabelasInput): ServicoEstimado[] {
  const fromPrincipal = input.servicosEstimados ?? []
  const fromInsumo: ServicoEstimado[] = (input.servicosComInsumoEstimado ?? []).map(s => ({
    id: s.id,
    numero: s.numero,
    descricao: s.descricao,
    valor: s.valor,
    itemPaiDescricao: s.itemPaiDescricao,
  }))

  const byId = new Map<string, ServicoEstimado>()
  const semId: ServicoEstimado[] = []

  for (const s of fromPrincipal) {
    if (s.id) byId.set(s.id, s)
    else semId.push(s)
  }
  for (const s of fromInsumo) {
    // fromInsumo vem de ServicoComInsumoEstimado (id sempre presente) mapeado
    // pra ServicoEstimado (id opcional, só ausente nos manuais) — a guarda
    // abaixo só existe pro TypeScript estreitar o tipo; na prática nunca é
    // um serviço-com-insumo-estimado sem id.
    if (!s.id) continue
    if (!byId.has(s.id)) byId.set(s.id, s)
  }

  return [...byId.values(), ...semId]
}

/** Filtra linhas visíveis em "(B) Serviços Estimados" — mesma regra do exportador original. */
export function filterServicosEstimadosVisiveis(
  servicosEstimados: ServicoEstimado[],
  servicosComInsumoEstimado: ServicoComInsumoEstimado[],
  incluirServicosComInsumoEstimado: boolean,
  servicosComInsumoEstimadoOcultos: Set<string>,
): ServicoEstimado[] {
  const idsComInsumoEstimado = new Set(servicosComInsumoEstimado.map(s => s.id))

  return servicosEstimados.filter(s => {
    if (!s.id || !idsComInsumoEstimado.has(s.id)) return true
    if (!incluirServicosComInsumoEstimado) return false
    return !servicosComInsumoEstimadoOcultos.has(s.id)
  })
}

/** Renderiza dashboard visual abaixo do cabeçalho mestre. */
export function drawResumoGeralDashboardPage(
  doc: jsPDF,
  margin: number,
  contentW: number,
  startY: number,
  input: ResumoGeralDashboardInput,
): void {
  const A = input.totalOrcadoA
  const B = input.totalServicosEstimadosB
  const C = A + B
  const { areaTotal, areaCoberta, areaEquivalente } = input

  let y = startY

  drawHeroBar(doc, margin, y, contentW, 16, 'TOTAL GERAL DO ORÇAMENTO  (A + B)', fmt(C), CADERNO_BRAND.primary)
  y += 16 + 8

  const cardH = drawCadernoKpiRow(doc, margin, y, contentW, [
    { label: 'TOTAL ORÇADO (A)', value: fmt(A), style: CADERNO_KPI_PRIMARY },
    { label: 'SERVIÇOS ESTIMADOS (B)', value: fmt(B), style: CADERNO_KPI_PRIMARY },
    {
      label: 'CUSTO/M² (ÁREA TOTAL)',
      value: areaTotal ? fmt(C / areaTotal) : '—',
      sub: areaTotal ? `Área: ${fmtQtd(areaTotal)} m²` : 'Área não informada',
      style: CADERNO_KPI_NEUTRAL,
    },
    {
      label: 'CUSTO/M² (ÁREAS COBERTAS)',
      value: areaCoberta ? fmt(C / areaCoberta) : '—',
      sub: areaCoberta ? `Área: ${fmtQtd(areaCoberta)} m²` : 'Área não informada',
      style: CADERNO_KPI_NEUTRAL,
    },
    {
      label: 'CUSTO/M² (ÁREA EQUIVALENTE)',
      value: areaEquivalente ? fmt(C / areaEquivalente) : '—',
      sub: areaEquivalente ? `Área: ${fmtQtd(areaEquivalente)} m²` : 'Área não informada',
      style: CADERNO_KPI_NEUTRAL,
    },
  ])
  y += cardH + 12

  drawTop5HorizontalBarChart(doc, input.distribuicaoCustos, margin, contentW, y)
}

/** Tabelas (A) Detalhamento por categoria e (B) Serviços Estimados. */
export async function drawResumoGeralDetailTables(
  doc: jsPDF,
  margin: number,
  contentW: number,
  pageH: number,
  startY: number,
  headerData: StandardHeaderData,
  sectionTitle: string,
  input: ResumoGeralTabelasInput,
  options: ResumoGeralTabelasOptions,
): Promise<void> {
  const { autoTable } = await import('jspdf-autotable')

  const split = splitResumoGeralDados(input)
  const A = split.totalOrcadoA
  const B = split.totalServicosEstimadosB
  const pageW = doc.internal.pageSize.getWidth()
  const tableLayout = pdfTableLayout(pageW)
  const headerHooks = standardHeaderAutoTableHooks(doc, headerData, sectionTitle, {
    skipFirstTablePage: true,
  })

  let y = startY

  function ensureSpaceWithHeader(required: number): number {
    if (y + required > pageH - margin) {
      addLandscapeA4Page(doc)
      y = drawStandardHeader(doc, headerData, sectionTitle)
    }
    return y
  }

  // ── (A) Detalhamento dos custos ───────────────────────────────────────────
  y = ensureSpaceWithHeader(12)
  y = drawResumoSectionTitle(doc, margin, y, '(A) DETALHAMENTO DOS CUSTOS')

  autoTable(doc, {
    startY: y,
    tableWidth: tableLayout.tableWidth,
    margin: headerHooks.margin,
    didDrawPage: headerHooks.didDrawPage,
    head: RESUMO_DETALHAMENTO_HEAD,
    body: split.categoriasA.map(n => [n.numero, n.descricao, fmt(n.totalComBdi), fmtPct(n.percentualComBdi)]),
    foot: [['', 'TOTAL GERAL', fmt(A), '100,00%']],
    showFoot: 'lastPage',
    ...globalTableStyles,
    columnStyles: resumoDetalhamentoColumnStyles(tableLayout.tableWidth),
  })

  // @ts-expect-error lastAutoTable injetado em runtime
  y = doc.lastAutoTable.finalY + 4

  // ── (B) Serviços Estimados ───────────────────────────────────────────────
  const servicosVisiveis = input.servicosEstimadosVisiveis ?? filterServicosEstimadosVisiveis(
    split.servicosEstimados,
    input.servicosComInsumoEstimado ?? [],
    options.incluirServicosComInsumoEstimado,
    options.servicosComInsumoEstimadoOcultos,
  )

  y = ensureSpaceWithHeader(12)
  y = drawResumoSectionTitle(doc, margin, y, '(B) SERVIÇOS ESTIMADOS')

  if (servicosVisiveis.length > 0) {
    autoTable(doc, {
      startY: y,
      tableWidth: tableLayout.tableWidth,
      margin: headerHooks.margin,
      didDrawPage: headerHooks.didDrawPage,
      head: RESUMO_DETALHAMENTO_HEAD,
      body: servicosVisiveis.map(s => [
        s.numero ?? '',
        s.itemPaiDescricao ? `${s.descricao}\n${s.itemPaiDescricao}` : s.descricao,
        fmt(s.valor),
        fmtPct(B > 0 ? (s.valor / B) * 100 : 0),
      ]),
      foot: [['', 'TOTAL', fmt(B), '100,00%']],
      showFoot: 'lastPage',
      ...globalTableStyles,
      columnStyles: resumoDetalhamentoColumnStyles(tableLayout.tableWidth),
    })
  } else {
    autoTable(doc, {
      startY: y,
      tableWidth: tableLayout.tableWidth,
      margin: headerHooks.margin,
      didDrawPage: headerHooks.didDrawPage,
      head: RESUMO_DETALHAMENTO_HEAD,
      body: [[
        {
          content: split.servicosEstimados.length === 0
            ? 'Nenhum serviço estimado cadastrado.'
            : 'Nenhum serviço estimado selecionado para exibição nesta exportação.',
          colSpan: 4,
          styles: {
            halign: 'left' as const,
            textColor: PDF_COLORS.textGray,
            fontStyle: 'normal' as const,
            fontSize: CADERNO_FONT.bodySm,
            cellPadding: { top: 2, bottom: 2, left: 2, right: 2 },
          },
        },
      ]],
      ...globalTableStyles,
      columnStyles: resumoDetalhamentoColumnStyles(tableLayout.tableWidth),
    })
  }
}
