/**
 * Seção Resumo Geral — dashboard (pág. 1) + tabelas (A) e (B) (pág. 2+).
 */
import type { jsPDF } from 'jspdf'
import type { RowInput } from 'jspdf-autotable'
import { fmt, fmtQtd, fmtPct } from '@/lib/curva-abc'
import type {
  CadernoNode,
  CategoriaResumoGrupo,
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
  /** Categorias de agrupamento definidas pelo usuário (Configurações) pra
   * tabela (A) — ver categorias-resumo.ts. Grupo de nível 1 não referenciado
   * em nenhuma continua aparecendo como linha solta (ver buildDetalhamentoRows). */
  categoriasResumo: CategoriaResumoGrupo[]
  /** Pré-filtrado no exportador (export-caderno-pdf.ts) — mesma regra do PDF original. */
  servicosEstimadosVisiveis?: ServicoEstimado[]
}

export interface ResumoGeralTabelasOptions {
  incluirServicosComInsumoEstimado: boolean
  servicosComInsumoEstimadoOcultos: Set<string>
}

/** Uma linha da tabela (A): cabeçalho de categoria (com subtotal) ou um grupo
 * de nível 1 — solto (sem categoria atribuída) ou membro de uma categoria
 * (indentado). Ver buildDetalhamentoRows. `percentual` é sempre sobre o TOTAL
 * DA OBRA (A+B, pedido explícito do usuário) — não usar
 * `node.percentualComBdi` pra exibição aqui, que é uma % diferente (sobre A
 * só, calculada em getCadernoData e usada por outras seções do Caderno como
 * Distribuição de Custos/Principais Itens). */
export type ResumoDetalhamentoRow =
  | { tipo: 'categoria'; letra: string; nome: string; total: number; percentual: number }
  | { tipo: 'grupo'; node: CadernoNode; indentado: boolean; percentual: number }

/** Resultado da separação (A) categorias padrão × (B) serviços estimados. */
export interface ResumoGeralSplitResult {
  categoriasA: CadernoNode[]
  /** Linhas já montadas pra tabela (A), com cabeçalhos de categoria
   * interleaved — ver buildDetalhamentoRows. */
  detalhamentoRows: ResumoDetalhamentoRow[]
  /** Itens de nível 1 reais (número/nome/valor verdadeiros), pro gráfico
   * "PRINCIPAIS ITENS DO ORÇAMENTO" — drawTop5HorizontalBarChart escolhe o
   * top 5 por valor. */
  principaisItens: DistribuicaoCustoItem[]
  /** Lista completa de (B) — detectados automaticamente (flag direta ou
   * insumo estimado) e cadastrados manualmente. Nenhum deles está contado
   * em totalOrcadoA (separação total). */
  servicosEstimados: ServicoEstimado[]
  totalOrcadoA: number
  totalServicosEstimadosB: number
}

/**
 * Monta as linhas da tabela (A) agrupadas pelas categorias que o usuário
 * definiu em Configurações (ver categorias-resumo.ts) — uma linha de
 * cabeçalho (letra + nome + subtotal) por categoria não-vazia, na ordem em
 * que foram criadas, seguida dos grupos membros; todo grupo de nível 1 não
 * referenciado em nenhuma categoria (configuração parcial, ou nenhuma
 * categoria criada ainda) vira linha solta no final, exatamente como antes
 * dessa feature existir — nunca cai num bucket "Outros" automático.
 *
 * `totalGeral` (A+B, pedido explícito do usuário) é o denominador de TODO
 * percentual desta tabela — categoria ou grupo solto — nunca o total da
 * própria categoria/tabela.
 */
function buildDetalhamentoRows(
  categoriasAComPct: CadernoNode[],
  categorias: CategoriaResumoGrupo[],
  totalGeral: number,
): ResumoDetalhamentoRow[] {
  const porNumero = new Map(categoriasAComPct.map(n => [n.numero, n]))
  const usados = new Set<string>()
  const rows: ResumoDetalhamentoRow[] = []
  let letraIndex = 0
  const pctDoTotalGeral = (valor: number) => totalGeral > 0 ? (valor / totalGeral) * 100 : 0

  for (const cat of categorias) {
    const membros = cat.numeros
      .map(numero => porNumero.get(numero))
      .filter((n): n is CadernoNode => !!n && !usados.has(n.numero))
    if (membros.length === 0) continue // nunca emite cabeçalho de categoria vazia

    for (const n of membros) usados.add(n.numero)
    const total = membros.reduce((s, n) => s + n.totalComBdi, 0)
    const percentual = pctDoTotalGeral(total)
    const letra = letraIndex < 26 ? String.fromCharCode(65 + letraIndex) : String(letraIndex + 1)
    letraIndex++

    rows.push({ tipo: 'categoria', letra, nome: cat.nome, total, percentual })
    for (const n of membros) rows.push({ tipo: 'grupo', node: n, indentado: true, percentual: pctDoTotalGeral(n.totalComBdi) })
  }

  for (const n of categoriasAComPct) {
    if (!usados.has(n.numero)) rows.push({ tipo: 'grupo', node: n, indentado: false, percentual: pctDoTotalGeral(n.totalComBdi) })
  }

  return rows
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
 * Monta (A) e (B) pra exibição — separação total, pedido explícito do
 * usuário em 2026-09-15: cada item conta uma vez só, ou em (A) ou em (B),
 * nunca nos dois. `input.arvore` já deve vir SEM as subárvores marcadas como
 * estimado (CadernoData.arvore, não arvoreCompleta) — quem monta o input
 * decide isso, aqui só soma o que veio. (B) soma TODOS os serviços
 * estimados — detectados automaticamente (flag direta ou insumo estimado) e
 * cadastrados manualmente — já que nenhum deles está contado em (A).
 */
export function splitResumoGeralDados(input: ResumoGeralTabelasInput): ResumoGeralSplitResult {
  const categoriasA = input.arvore
  const servicosEstimados = resolveServicosEstimadosParaTabela(input)
  const totalOrcadoA = categoriasA.reduce((sum, n) => sum + n.totalComBdi, 0)
  const totalServicosEstimadosB = servicosEstimados.reduce((sum, s) => sum + s.valor, 0)
  const totalGeral = totalOrcadoA + totalServicosEstimadosB

  // percentualComBdi aqui continua sobre (A) só — usado pelo gráfico
  // "Principais Itens do Orçamento" do dashboard (página 1), que é uma seção
  // diferente de "(A) DETALHAMENTO DOS CUSTOS" (buildDetalhamentoRows abaixo
  // já calcula o percentual certo, sobre o total da obra, por conta própria).
  const categoriasAComPct = categoriasA.map(n => ({
    ...n,
    percentualComBdi: totalOrcadoA > 0 ? (n.totalComBdi / totalOrcadoA) * 100 : 0,
  }))

  // "Principais Itens do Orçamento" (dashboard, pág. 1) — itens de nível 1
  // de verdade (número e nome reais), não mais a categoria fixa agregada de
  // categorias_grafico (que também trazia número/nome sintéticos, sem
  // correspondência com a Planilha — ver decisão de 2026-09-15).
  const principaisItens: DistribuicaoCustoItem[] = categoriasAComPct.map(n => ({
    numero: n.numero,
    label: n.descricao,
    value: n.totalComBdi,
    percentual: n.percentualComBdi,
    color: CADERNO_BRAND.primary,
  }))

  return {
    categoriasA: categoriasAComPct,
    detalhamentoRows: buildDetalhamentoRows(categoriasAComPct, input.categoriasResumo, totalGeral),
    principaisItens,
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
  // Total da obra (A+B) — denominador de todo percentual das tabelas (A) e
  // (B) abaixo, pedido explícito do usuário: percentual de cada linha/
  // subtotal é sempre sobre o total da obra, nunca sobre o total da própria
  // categoria (A ou B).
  const totalGeral = A + B
  const pctDoTotalGeral = (valor: number) => totalGeral > 0 ? (valor / totalGeral) * 100 : 0
  const pageW = doc.internal.pageSize.getWidth()
  const tableLayout = pdfTableLayout(pageW)
  const headerHooks = standardHeaderAutoTableHooks(doc, headerData, sectionTitle, {
    skipFirstTablePage: true,
  })

  const servicosVisiveis = input.servicosEstimadosVisiveis ?? filterServicosEstimadosVisiveis(
    split.servicosEstimados,
    input.servicosComInsumoEstimado ?? [],
    options.incluirServicosComInsumoEstimado,
    options.servicosComInsumoEstimadoOcultos,
  )

  // Largura da coluna "Item" calculada pelo numero mais longo de verdade,
  // entre (A) e (B) — mesma correção já aplicada em planilhaPrecosColumnStyles
  // pra numeração de nível profundo não cortar dígitos (overflow:'hidden').
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(globalTableStyles.styles.fontSize)
  const numerosA = split.detalhamentoRows.map(row => row.tipo === 'categoria' ? row.letra : row.node.numero)
  const numerosB = servicosVisiveis.map(s => s.numero ?? '')
  const maiorNumero = [...numerosA, ...numerosB].reduce((max, n) => (n.length > max.length ? n : max), '')
  const itemColWidth = Math.max(12, doc.getTextWidth(maiorNumero) + 4)
  const detalhamentoColumnStyles = resumoDetalhamentoColumnStyles(tableLayout.tableWidth, itemColWidth)

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
    body: split.detalhamentoRows.map(row => row.tipo === 'categoria'
      ? [row.letra, row.nome, fmt(row.total), fmtPct(row.percentual)]
      : [row.node.numero, row.node.descricao, fmt(row.node.totalComBdi), fmtPct(row.percentual)]),
    foot: [['', 'TOTAL GERAL', fmt(A), fmtPct(pctDoTotalGeral(A))]],
    showFoot: 'lastPage',
    ...globalTableStyles,
    columnStyles: detalhamentoColumnStyles,
    didParseCell: (cellData) => {
      if (cellData.section !== 'body') return
      const row = split.detalhamentoRows[cellData.row.index]
      if (!row) return
      if (row.tipo === 'categoria') {
        // Azul da marca (CADERNO_BRAND.secondary — mesmo tom já usado nas
        // capas/KPIs do Caderno) + texto branco — pedido explícito do
        // usuário pra diferenciar do roxo do cabeçalho da própria tabela.
        cellData.cell.styles.fillColor = CADERNO_BRAND.secondary
        cellData.cell.styles.textColor = '#ffffff'
        cellData.cell.styles.fontStyle = 'bold'
        return
      }
      if (row.indentado && cellData.column.index === 1) {
        cellData.cell.styles.cellPadding = { top: 2, bottom: 2, left: 5, right: 2 }
      }
    },
  })

  // @ts-expect-error lastAutoTable injetado em runtime
  y = doc.lastAutoTable.finalY + 4

  // ── (B) Serviços Estimados ───────────────────────────────────────────────
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
        fmtPct(pctDoTotalGeral(s.valor)),
      ]),
      foot: [['', 'TOTAL', fmt(B), fmtPct(pctDoTotalGeral(B))]],
      showFoot: 'lastPage',
      ...globalTableStyles,
      columnStyles: detalhamentoColumnStyles,
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
