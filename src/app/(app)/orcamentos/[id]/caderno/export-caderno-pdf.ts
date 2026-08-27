import type { jsPDF } from 'jspdf'
import type { RowInput } from 'jspdf-autotable'
import { fmt, fmtQtd, fmtPct, type AbcItem } from '@/lib/curva-abc'
import { formatDate } from '@/lib/format-date'
import type { CadernoData, CadernoNode, AbcClasse } from '@/lib/orcamento/caderno'
import { slugFilename } from '../relatorios/exporters/xlsx-shared'
import {
  PDF_COLORS,
  drawAbcChart,
  drawAbcKpiCards,
  abcTableHead,
  abcTableBody,
  abcTableFoot,
  abcTableColumnStyles,
  abcRowFillColor,
  abcRowTextColor,
} from '@/lib/pdf/abc-section'
import {
  KPI_STYLE_NEUTRAL,
  drawDonutChart,
  drawDonutLegend,
  drawKpiCard,
  type DonutSegment,
} from '@/lib/pdf/charts'

const GROUP_FILL = '#f1f5f9'

// Classe ABC por item — mesmo mapeamento canônico da Curva ABC (ver
// src/components/ui/badge.tsx): A = verde (maior prioridade de acompanhamento,
// concentra ~80% do custo), C = vermelho. Estava invertido aqui (bug real,
// corrigido durante a reformulação de UI/UX).
const ABC_BG: Record<AbcClasse, string> = { A: '#dcfce7', B: '#fef3c7', C: '#fee2e2' }
const ABC_FG: Record<AbcClasse, string> = { A: '#15803d', B: '#b45309', C: '#b91c1c' }

// ─── Cabeçalho de documento (logo + cliente + obra + título + REV + data) ────

function drawDocumentHeader(
  doc: jsPDF,
  data: CadernoData,
  margin: number,
  contentW: number,
  titulo: string,
) {
  const HEADER_H = 24
  const LEFT_W   = 62
  const RIGHT_W  = 52
  const CTR_W    = contentW - LEFT_W - RIGHT_W
  const lx = margin
  const cx = margin + LEFT_W
  const rx = cx + CTR_W
  const ty = margin

  const { nome_obra, cliente } = data.orcamento
  const dateStr = formatDate(new Date())

  // Fundo único
  doc.setFillColor(BRAND_PRIMARY)
  doc.rect(lx, ty, contentW, HEADER_H, 'F')

  // Divisórias internas (linha fina branca)
  doc.setDrawColor('#ffffff')
  doc.setLineWidth(0.15)
  doc.line(cx, ty + 2, cx, ty + HEADER_H - 2)
  doc.line(rx, ty + 2, rx, ty + HEADER_H - 2)

  // Borda externa
  doc.setDrawColor('#0f172a')
  doc.setLineWidth(0.3)
  doc.rect(lx, ty, contentW, HEADER_H)

  // Logo
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor('#ffffff')
  doc.text('FS CONSULTORES', lx + 2, ty + 8)

  // Esquerda: cliente / obra
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor('#cbd5e1')
  doc.text(doc.splitTextToSize(`Cliente: ${cliente || '—'}`, LEFT_W - 4)[0], lx + 2, ty + 15)
  doc.text(doc.splitTextToSize(`Obra: ${nome_obra || '—'}`, LEFT_W - 4)[0], lx + 2, ty + 20)

  // Centro: título
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor('#ffffff')
  doc.text(titulo, cx + CTR_W / 2, ty + HEADER_H / 2 + 2, { align: 'center' })

  // Direita: REV / Data
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor('#ffffff')
  doc.text('REV 00', rx + RIGHT_W - 2, ty + 10, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor('#94a3b8')
  doc.text(`Data: ${dateStr}`, rx + RIGHT_W - 2, ty + 17, { align: 'right' })
}

// ─── Helpers de layout ────────────────────────────────────────────────────────

// Identidade FS Consultores (design system 2026 — mesmos hex de tailwind.config.ts:
// primary.700 e secondary.500) usada na capa E em todo o resto do Caderno (títulos de
// seção, cabeçalhos de tabela, KPIs) — pedido explícito pra bater com a capa. Isso é
// uma exceção só do Caderno: os outros exports em PDF (Planilha Sintética/Analítica,
// Curva ABC avulsa) continuam usando PDF_COLORS.bannerBg/totalBg (neutro — ver
// comentário em lib/pdf/abc-section.ts), então aqui a gente usa constantes locais em
// vez de mudar PDF_COLORS, que é compartilhado com aqueles outros exports.
const BRAND_PRIMARY = '#52276E'
const BRAND_SECONDARY = '#344DA1'
const CADERNO_KPI_PRIMARY = { bg: BRAND_SECONDARY, fg: '#ffffff', subFg: '#c7d2f0' }

// Barras verticais nos cantos, ecoando o ícone do logo — só decoração de marca,
// sem informação nenhuma (por isso não depende de nenhum dado do orçamento).
function drawBrandCornerBars(doc: jsPDF, pageW: number, pageH: number, color: string) {
  const alturas = [7, 10, 13, 16, 19]
  const barW = 3.2
  const gap = 1.6
  doc.setFillColor(color)

  let x = pageW - (alturas.length * barW + (alturas.length - 1) * gap)
  for (const h of alturas) {
    doc.rect(x, 0, barW, h, 'F')
    x += barW + gap
  }

  x = 0
  for (const h of [...alturas].reverse()) {
    doc.rect(x, pageH - h, barW, h, 'F')
    x += barW + gap
  }
}

async function addCoverPage(doc: jsPDF, data: CadernoData, pageW: number, pageH: number) {
  doc.setFillColor('#ffffff')
  doc.rect(0, 0, pageW, pageH, 'F')

  drawBrandCornerBars(doc, pageW, pageH, BRAND_SECONDARY)

  // Logo real da FS Consultores (public/logofs.png, o mesmo arquivo já usado na
  // exportação em Excel — ver use-planilha-export.ts). Se o fetch falhar, a capa
  // segue sem logo em vez de travar a exportação do Caderno inteiro.
  try {
    const resp = await fetch('/logofs.png')
    if (resp.ok) {
      const buf = await resp.arrayBuffer()
      const logoW = 90
      const logoH = logoW * (617 / 2156) // proporção real do arquivo (2156×617px)
      doc.addImage(new Uint8Array(buf), 'PNG', (pageW - logoW) / 2, 28, logoW, logoH)
    }
  } catch { /* logo opcional — nunca bloqueia a exportação */ }

  const { nome_obra, codigo, cliente } = data.orcamento

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(BRAND_PRIMARY)
  doc.text(nome_obra || '—', pageW / 2, pageH / 2 - 4, { align: 'center' })

  doc.setFontSize(14)
  doc.setTextColor(BRAND_SECONDARY)
  doc.text('CADERNO DE ORÇAMENTO', pageW / 2, pageH / 2 + 7, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor('#6b7280')
  const linha2 = [codigo ? `Cód. ${codigo}` : null, cliente].filter(Boolean).join('   •   ')
  if (linha2) doc.text(linha2, pageW / 2, pageH / 2 + 15, { align: 'center' })

  doc.setFontSize(9)
  doc.text(`Gerado em ${formatDate(new Date())}`, pageW / 2, pageH - 14, { align: 'center' })
}

function addDivider(doc: jsPDF, pageW: number, pageH: number, numero: string, titulo: string, subtitle?: string) {
  // Divisória de seção sempre em retrato (A4), mesmo padrão da capa — ver
  // exportCadernoPdf: só capa/divisórias ficam em retrato, o conteúdo
  // (tabelas largas) volta pra paisagem logo em seguida.
  doc.addPage('a4', 'portrait')
  // Mesmo tratamento da capa — fundo branco, texto colorido (nunca o
  // inverso: fundo cheio de cor com texto branco) — pra ser realmente
  // "parecido com a capa", não só usar os mesmos hex em outro arranjo.
  doc.setFillColor('#ffffff')
  doc.rect(0, 0, pageW, pageH, 'F')
  drawBrandCornerBars(doc, pageW, pageH, BRAND_SECONDARY)

  doc.setTextColor(BRAND_SECONDARY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(numero, pageW / 2, pageH / 2 - 14, { align: 'center' })

  doc.setTextColor(BRAND_PRIMARY)
  doc.setFontSize(22)
  doc.text(titulo, pageW / 2, pageH / 2 - 2, { align: 'center' })

  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor('#6b7280')
    doc.text(subtitle, pageW / 2, pageH / 2 + 10, { align: 'center' })
  }
}

function addSectionBanner(doc: jsPDF, margin: number, contentW: number, numero: string, title: string, subtitle: string) {
  doc.setFillColor(BRAND_PRIMARY)
  doc.rect(margin, margin, contentW, 16, 'F')
  doc.setTextColor(PDF_COLORS.bannerFg)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(`${numero}  ${title}`, margin + 4, margin + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(subtitle, margin + 4, margin + 12.5)
}

// ─── Seção: Resumo Geral do Orçamento ────────────────────────────────────────

async function drawResumoGeralSection(
  doc: jsPDF, data: CadernoData, margin: number, contentW: number, subtitle: string, numero: string,
  incluirServicosComInsumoEstimado: boolean, servicosComInsumoEstimadoOcultos: Set<string>
) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage('a4', 'landscape')
  addSectionBanner(doc, margin, contentW, numero, 'RESUMO GERAL DO ORÇAMENTO', subtitle)

  const top = margin + 16 + 8
  const leftW = 120
  const gap = 4
  const rightX = margin + leftW + gap
  const rightW = contentW - leftW - gap

  const A = data.totalGeralComBdi
  const B = data.totalServicosEstimados
  const C = A + B
  const { area_total, area_coberta, area_equivalente } = data.orcamento

  // ── Coluna esquerda: (A) Total Orçado ─────────────────────────────────────
  let yLeft = top
  doc.setFillColor(BRAND_SECONDARY)
  doc.rect(margin, yLeft, leftW, 8, 'F')
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('(A) TOTAL ORÇADO', margin + 3, yLeft + 5.5)
  doc.text(fmt(A), margin + leftW - 3, yLeft + 5.5, { align: 'right' })
  yLeft += 8

  autoTable(doc, {
    startY: yLeft,
    margin: { left: margin, right: margin + contentW - leftW, bottom: margin },
    head: [['Descrição', 'Valor Geral (R$)', '% / Total']],
    body: data.arvore.map(n => [n.descricao, fmt(n.totalComBdi), fmtPct(n.percentualComBdi)]),
    foot: [['TOTAL GERAL', fmt(A), '100,00%']],
    showFoot: 'lastPage',
    styles: { fontSize: 6.5, cellPadding: 1, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: BRAND_PRIMARY, textColor: '#ffffff', fontStyle: 'bold', halign: 'center', fontSize: 7 },
    footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: leftW - 50 },
      1: { cellWidth: 30, halign: 'right' },
      2: { cellWidth: 20, halign: 'right' },
    },
  })

  // @ts-expect-error lastAutoTable é injetado em runtime pelo plugin jspdf-autotable
  yLeft = doc.lastAutoTable.finalY + 6

  // ── Coluna esquerda: (B) Serviços Estimados ───────────────────────────────
  doc.setFillColor(BRAND_SECONDARY)
  doc.rect(margin, yLeft, leftW, 8, 'F')
  doc.setTextColor('#ffffff')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('(B) SERVIÇOS ESTIMADOS', margin + 3, yLeft + 5.5)
  doc.text(fmt(B), margin + leftW - 3, yLeft + 5.5, { align: 'right' })
  yLeft += 8

  // Filtra só a LISTAGEM — o total (B) acima sempre reflete o valor real,
  // completo, independente do que fica visível aqui. Só linhas com `id`
  // (serviço com insumo de preço estimado, ver ServicoComInsumoEstimado)
  // podem ser ocultadas — itens "- Estimado" sem insumo e os manuais
  // (orcamento_servicos_estimados) não têm essa opção, sempre aparecem.
  // Escolha feita na hora de gerar o relatório (Relatórios > Caderno >
  // "Configurar..."), nunca salva no orçamento.
  const servicosVisiveis = data.servicosEstimados.filter(s => {
    if (!s.id) return true
    if (!incluirServicosComInsumoEstimado) return false
    return !servicosComInsumoEstimadoOcultos.has(s.id)
  })

  if (servicosVisiveis.length > 0) {
    autoTable(doc, {
      startY: yLeft,
      margin: { left: margin, right: margin + contentW - leftW, bottom: margin },
      head: [['Descrição', 'Valor Geral (R$)', '% / Total']],
      // Só a descrição exata do item, igual está na planilha — nada de
      // numeração nem do item pai (esse continua existindo em
      // ServicoEstimado.itemPaiDescricao só pra desambiguar internamente
      // quando o mesmo nome se repete em mais de um lugar da árvore, ver
      // servicos-estimados-modal.tsx; não aparece mais no Caderno).
      body: servicosVisiveis.map(s => [
        s.descricao,
        fmt(s.valor), fmtPct(B > 0 ? (s.valor / B) * 100 : 0),
      ]),
      foot: [['TOTAL', fmt(B), '100,00%']],
      showFoot: 'lastPage',
      styles: { fontSize: 6.5, cellPadding: 1, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
      headStyles: { fillColor: BRAND_PRIMARY, textColor: '#ffffff', fontStyle: 'bold', halign: 'center', fontSize: 7 },
      footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: leftW - 50 },
        1: { cellWidth: 30, halign: 'right' },
        2: { cellWidth: 20, halign: 'right' },
      },
    })
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text(
      data.servicosEstimados.length === 0
        ? 'Nenhum serviço estimado cadastrado.'
        : 'Nenhum serviço estimado selecionado para exibição nesta exportação.',
      margin + 3, yLeft + 5
    )
  }

  // ── Coluna direita: KPI cards ──────────────────────────────────────────────
  const cardGap = 3
  const cardW = (rightW - cardGap * 2) / 3
  const cardH = 18

  drawKpiCard(doc, rightX, top, cardW, cardH, 'TOTAL GERAL (C) = (A+B)', fmt(C), undefined, CADERNO_KPI_PRIMARY)
  drawKpiCard(doc, rightX + (cardW + cardGap), top, cardW, cardH, 'TOTAL ORÇADO (A)', fmt(A), undefined, CADERNO_KPI_PRIMARY)
  drawKpiCard(doc, rightX + (cardW + cardGap) * 2, top, cardW, cardH, 'SERVIÇOS ESTIMADOS (B)', fmt(B), undefined, CADERNO_KPI_PRIMARY)

  const row2Y = top + cardH + cardGap
  drawKpiCard(doc, rightX, row2Y, cardW, cardH, 'CUSTO/M² (ÁREA TOTAL)',
    area_total ? fmt(C / area_total) : '—',
    area_total ? `Área: ${fmtQtd(area_total)} m²` : 'Área não informada', KPI_STYLE_NEUTRAL)
  drawKpiCard(doc, rightX + (cardW + cardGap), row2Y, cardW, cardH, 'CUSTO/M² (ÁREAS COBERTAS)',
    area_coberta ? fmt(C / area_coberta) : '—',
    area_coberta ? `Área: ${fmtQtd(area_coberta)} m²` : 'Área não informada', KPI_STYLE_NEUTRAL)
  drawKpiCard(doc, rightX + (cardW + cardGap) * 2, row2Y, cardW, cardH, 'CUSTO/M² (ÁREA EQUIVALENTE)',
    area_equivalente ? fmt(C / area_equivalente) : '—',
    area_equivalente ? `Área: ${fmtQtd(area_equivalente)} m²` : 'Área não informada', KPI_STYLE_NEUTRAL)

  // ── Coluna direita: distribuição dos custos (gráfico de rosca) ────────────
  const donutTop = row2Y + cardH + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor('#374151')
  doc.text('DISTRIBUIÇÃO DOS CUSTOS (A)', rightX, donutTop)

  const segments: DonutSegment[] = data.distribuicaoCustos.map(d => ({
    label: d.numero ? `${d.numero} ${d.label}` : d.label,
    value: d.value,
    color: d.color,
  }))

  const outerR = 32
  const cx = rightX + outerR + 4
  const cy = donutTop + 6 + outerR
  drawDonutChart(doc, segments, cx, cy, outerR)

  const legendX = cx + outerR + 6
  const legendW = rightX + rightW - legendX
  const lineH = 4
  const maxRowsPerCol = Math.max(1, Math.floor((outerR * 2) / lineH))
  const numCols = Math.max(1, Math.ceil(segments.length / maxRowsPerCol))
  const colW = legendW / numCols
  drawDonutLegend(doc, segments, legendX, cy - outerR + lineH, lineH, 6, colW, maxRowsPerCol)
}

// ─── Seção: Custo / m² ────────────────────────────────────────────────────────

async function drawCustoM2Section(doc: jsPDF, data: CadernoData, margin: number, contentW: number, subtitle: string, numero: string) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage('a4', 'landscape')
  addSectionBanner(doc, margin, contentW, numero, 'CUSTO / M²', subtitle)

  const { nome_obra, cliente, local, area_total, area_coberta, area_equivalente } = data.orcamento
  const A = data.totalGeralComBdi
  const B = data.totalServicosEstimados
  const C = A + B

  // ── Identificação (Cliente / Obra / Local) ────────────────────────────────
  let y = margin + 16 + 8
  const infoLines: [string, string][] = [
    ['CLIENTE', cliente || '—'],
    ['OBRA', nome_obra || '—'],
  ]
  if (local) infoLines.push(['LOCAL', local])
  doc.setFontSize(9)
  for (const [label, value] of infoLines) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor('#374151')
    doc.text(`${label}:`, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor('#1f2937')
    doc.text(value, margin + 22, y)
    y += 6
  }

  // ── Tabela de áreas ─────────────────────────────────────────────────────────
  // Com pavimentos cadastrados (Configurações), uma linha por pavimento +
  // uma linha de soma "ÁREA TOTAL:" (colSpan nas 2 primeiras colunas, igual
  // ao modelo de referência). Sem pavimentos, mantém o comportamento de
  // sempre: uma única linha "ÁREA TOTAL:" com os campos únicos do orçamento
  // (que já são a mesma coisa que a soma, quando há pavimentos — ver
  // getCadernoData).
  const temPavimentos = data.pavimentos.length > 0
  const linhaTotal = [
    'ÁREA TOTAL:',
    'M²',
    area_total != null ? fmtQtd(area_total) : '—',
    area_equivalente != null ? fmtQtd(area_equivalente) : '—',
    area_coberta != null ? fmtQtd(area_coberta) : '—',
  ]

  y += 4
  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['PAVIMENTO', 'UN', 'ÁREA TOTAL', 'ÁREA EQUIVALENTE', 'ÁREAS COBERTAS']],
    body: temPavimentos
      ? data.pavimentos.map(p => [p.descricao, p.unidade, fmtQtd(p.area_total), fmtQtd(p.area_equivalente), fmtQtd(p.area_coberta)])
      : [linhaTotal],
    foot: temPavimentos ? [[{ content: 'ÁREA TOTAL:', colSpan: 2 }, ...linhaTotal.slice(2)]] as RowInput[] : undefined,
    showFoot: temPavimentos ? 'lastPage' : undefined,
    styles: { fontSize: 9, cellPadding: 2.5, valign: 'middle', halign: 'right', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: BRAND_PRIMARY, textColor: '#ffffff', fontStyle: 'bold', halign: 'center' },
    bodyStyles: temPavimentos
      ? { fillColor: '#ffffff', textColor: '#1f2937', fontStyle: 'normal' }
      : { fillColor: GROUP_FILL, textColor: BRAND_PRIMARY, fontStyle: 'bold' },
    footStyles: { fillColor: GROUP_FILL, textColor: BRAND_PRIMARY, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center' },
    },
  })

  // @ts-expect-error lastAutoTable é injetado em runtime pelo plugin jspdf-autotable
  y = doc.lastAutoTable.finalY + 6

  // ── Faixas: custo total e custo/m² ────────────────────────────────────────
  const rowH = 11
  function row(label: string, value: string, bg: string) {
    doc.setFillColor(bg)
    doc.rect(margin, y, contentW, rowH, 'F')
    doc.setTextColor('#ffffff')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(label, margin + 4, y + rowH / 2 + 1.5)
    doc.text(value, margin + contentW - 4, y + rowH / 2 + 1.5, { align: 'right' })
    y += rowH + 2
  }

  row('CUSTO TOTAL DO ORÇAMENTO', fmt(C), BRAND_PRIMARY)
  row('CUSTO / M² (ÁREA TOTAL)', area_total ? fmt(C / area_total) : '—', BRAND_SECONDARY)
  row('CUSTO / M² (ÁREA EQUIVALENTE)', area_equivalente ? fmt(C / area_equivalente) : '—', BRAND_SECONDARY)
  row('CUSTO / M² (ÁREAS COBERTAS)', area_coberta ? fmt(C / area_coberta) : '—', BRAND_SECONDARY)
}

// ─── Seção: Planilha de Preços Unitários ─────────────────────────────────────

function flattenArvore(
  nodes: CadernoNode[],
  depth = 0,
  ancestorEstimado = false,
  out: { node: CadernoNode; depth: number; estimado: boolean }[] = [],
) {
  for (const n of nodes) {
    // Um grupo marcado como estimado não marca cada filho individualmente no
    // banco (só o próprio grupo) — herda pra baixo aqui pra destacar a
    // subárvore inteira, não só a linha-pai.
    const estimado = ancestorEstimado || n.estimado
    out.push({ node: n, depth, estimado })
    flattenArvore(n.filhos, depth + 1, estimado, out)
  }
  return out
}

// Soma "com BDI" de um nó, substituindo pelo valor_estimado (override manual
// da aba Estimados) quando o próprio nó tem um — do contrário usa o total
// calculado (ou a soma dos filhos, já refletindo overrides deles). valor_
// estimado é digitado SEM BDI (mesma convenção de caderno.ts/
// valorEstimadoComBdi — o placeholder do campo na aba Estimados mostra
// node.total, que é sem BDI), então aplica aqui a mesma taxa de BDI que já
// se aplicaria ao total calculado do nó — sem isso, o override apareceria
// sem BDI no meio de uma planilha onde todo o resto tem, e divergiria do
// valor mostrado em "(B) Serviços Estimados" (que já faz esse ajuste).
function totalComBdiEfetivo(node: CadernoNode): number {
  if (node.estimado && node.valor_estimado != null) {
    return node.total > 0 ? node.valor_estimado * (node.totalComBdi / node.total) : node.valor_estimado
  }
  if (node.filhos.length === 0) return node.totalComBdi
  return node.filhos.reduce((s, f) => s + totalComBdiEfetivo(f), 0)
}

async function drawPlanilhaPrecosSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, subtitle: string, numero: string) {
  const { autoTable } = await import('jspdf-autotable')

  const HEADER_H = 24
  const tableTop = margin + HEADER_H + 4

  doc.addPage('a4', 'landscape')

  // arvoreCompleta (não arvore): itens estimados ficam visíveis aqui, só
  // destacados em amarelo — não somem da planilha por estarem sem preço
  // fechado. O Total Orçado (A) e a Curva ABC continuam calculados só sobre
  // itens confirmados (data.arvore), essa seção é só de exibição.
  const flat = flattenArvore(data.arvoreCompleta)
  // "Preço de Custo" (sem BDI) não tem override — valor_estimado é sempre um
  // valor final (ver sumLeaves em caderno.ts), então só a coluna com BDI é
  // ajustada por item; o detalhamento de custo de um item com override
  // continua mostrando o calculado (melhor estimativa disponível).
  const totalGeralCompleto = data.arvoreCompleta.reduce((s, n) => s + n.total, 0)
  const totalGeralComBdiCompleto = data.arvoreCompleta.reduce((s, n) => s + totalComBdiEfetivo(n), 0)

  // BDI efetivo do orçamento inteiro é zero quando o total com BDI bate com o
  // total sem BDI — cobre tanto bdi_global=0 quanto o caso (mais raro) de todo
  // bdi_especifico individual também ser 0. Sem BDI em lugar nenhum, "Preço de
  // Custo" x "Preço de Venda" são sempre o mesmo número — pedido explícito pra
  // não rotular como "custo" um preço que já é o preço final, nem mostrar uma
  // coluna de BDI (%) que só mostraria 0,00% em toda linha.
  const temBdi = Math.abs(totalGeralComBdiCompleto - totalGeralCompleto) >= 0.01
  const totalParaPct = temBdi ? totalGeralComBdiCompleto : totalGeralCompleto
  const pct = (v: number) => fmtPct(totalParaPct > 0 ? (v / totalParaPct) * 100 : 0)

  const body: RowInput[] = flat.map(({ node, depth }) => {
    const indent = '   '.repeat(depth)
    if (!temBdi) {
      const totalEfetivo = totalComBdiEfetivo(node)
      if (node.tipo === 'grupo') {
        return [node.numero, node.codigo ?? '', indent + node.descricao, '', '', '', '', '', fmt(totalEfetivo), pct(totalEfetivo), '']
      }
      return [
        node.numero,
        node.codigo ?? '',
        indent + node.descricao,
        node.unidade ?? '',
        fmtQtd(node.quantidade ?? 0),
        fmt(node.custoMat),
        fmt(node.custoMo),
        fmt(node.custoTerceiros),
        fmt(node.custoUnitario),
        fmt(totalEfetivo),
        pct(totalEfetivo),
        node.classeAbc ?? '',
      ]
    }
    // Preço de Custo (sem BDI) x BDI (%) x Preço de Venda (com BDI) lado a lado
    // — formato pedido explicitamente pra bater com o modelo de planilha de
    // preços unitários que o cliente já usa fora do sistema. Grupo não tem "um"
    // BDI (os filhos podem ter taxas diferentes), então mostra o markup efetivo
    // agregado (node.bdiPercentual — ver comentário em caderno.ts) em vez de
    // deixar em branco.
    const totalComBdiRow = totalComBdiEfetivo(node)
    if (node.tipo === 'grupo') {
      return [
        node.numero, node.codigo ?? '', indent + node.descricao, '', '',
        '', '', '',
        '', fmt(node.total),
        fmtPct(node.bdiPercentual),
        '', fmt(totalComBdiRow),
        pct(totalComBdiRow),
        '',
      ]
    }
    return [
      node.numero,
      node.codigo ?? '',
      indent + node.descricao,
      node.unidade ?? '',
      fmtQtd(node.quantidade ?? 0),
      fmt(node.custoMat),
      fmt(node.custoMo),
      fmt(node.custoTerceiros),
      fmt(node.custoUnitario),
      fmt(node.total),
      fmtPct(node.bdiPercentual),
      fmt(node.custoUnitarioComBdi),
      fmt(totalComBdiRow),
      pct(totalComBdiRow),
      node.classeAbc ?? '',
    ]
  })

  const head: RowInput[] = temBdi
    ? [
        [
          { content: 'Item', rowSpan: 2 },
          { content: 'Cód.', rowSpan: 2 },
          { content: 'Descrição', rowSpan: 2 },
          { content: 'Und', rowSpan: 2 },
          { content: 'Qtd', rowSpan: 2 },
          { content: 'Detalhamento do Custo Unitário', colSpan: 3 },
          { content: 'Preço de Custo', colSpan: 2 },
          { content: 'BDI (%)', rowSpan: 2 },
          { content: 'Preço de Venda', colSpan: 2 },
          { content: '%', rowSpan: 2 },
          { content: 'ABC', rowSpan: 2 },
        ],
        ['Mat/Equip', 'M.O.', 'Terceiros', 'Unitário', 'Total', 'Unitário', 'Total'],
      ]
    : [
        [
          { content: 'Item', rowSpan: 2 },
          { content: 'Cód.', rowSpan: 2 },
          { content: 'Descrição', rowSpan: 2 },
          { content: 'Und', rowSpan: 2 },
          { content: 'Qtd', rowSpan: 2 },
          { content: 'Detalhamento do Custo Unitário', colSpan: 3 },
          { content: 'Preço', colSpan: 2 },
          { content: '%', rowSpan: 2 },
          { content: 'ABC', rowSpan: 2 },
        ],
        ['Mat/Equip', 'M.O.', 'Terceiros', 'Unitário', 'Total'],
      ]

  const foot: RowInput[] = temBdi
    ? [[
        '', '', 'TOTAL GERAL', '', '',
        '', '', '',
        '', fmt(totalGeralCompleto),
        fmtPct(totalGeralCompleto > 0 ? (totalGeralComBdiCompleto / totalGeralCompleto - 1) * 100 : 0),
        '', fmt(totalGeralComBdiCompleto),
        fmtPct(100),
        '',
      ]]
    : [['', '', 'TOTAL GERAL', '', '', '', '', '', fmt(totalGeralCompleto), fmtPct(100), '']]

  const columnStylesComBdi = {
    0: { cellWidth: 12, halign: 'center' as const },
    1: { cellWidth: 16 },
    2: { cellWidth: 62 },
    3: { cellWidth: 10, halign: 'center' as const },
    4: { cellWidth: 14, halign: 'right' as const },
    5: { cellWidth: 18, halign: 'right' as const },
    6: { cellWidth: 16, halign: 'right' as const },
    7: { cellWidth: 18, halign: 'right' as const },
    8: { cellWidth: 19, halign: 'right' as const },
    9: { cellWidth: 20, halign: 'right' as const },
    10: { cellWidth: 13, halign: 'right' as const },
    11: { cellWidth: 19, halign: 'right' as const },
    12: { cellWidth: 20, halign: 'right' as const },
    13: { cellWidth: 11, halign: 'right' as const },
    14: { cellWidth: 9, halign: 'center' as const },
  }
  const columnStylesSemBdi = {
    0: { cellWidth: 13, halign: 'center' as const },
    1: { cellWidth: 18 },
    2: { cellWidth: 82 },
    3: { cellWidth: 11, halign: 'center' as const },
    4: { cellWidth: 16, halign: 'right' as const },
    5: { cellWidth: 21, halign: 'right' as const },
    6: { cellWidth: 19, halign: 'right' as const },
    7: { cellWidth: 21, halign: 'right' as const },
    8: { cellWidth: 24, halign: 'right' as const },
    9: { cellWidth: 26, halign: 'right' as const },
    10: { cellWidth: 13, halign: 'right' as const },
    11: { cellWidth: 10, halign: 'center' as const },
  }
  const abcColIndex = temBdi ? 14 : 11

  autoTable(doc, {
    startY: tableTop,
    willDrawPage: () => { drawDocumentHeader(doc, data, margin, contentW, 'PLANILHA DE PREÇOS UNITÁRIOS') },
    margin: { left: margin, right: margin, bottom: margin, top: tableTop },
    head,
    body,
    foot,
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    styles: { fontSize: 6.5, cellPadding: 1, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: BRAND_PRIMARY, textColor: '#ffffff', fontStyle: 'bold', halign: 'center', fontSize: 6.5 },
    footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', lineWidth: 0.1 },
    columnStyles: temBdi ? columnStylesComBdi : columnStylesSemBdi,
    didParseCell: (cellData) => {
      if (cellData.section !== 'body') return
      const { node, estimado } = flat[cellData.row.index]
      // Mesmo destaque em âmbar usado na Planilha Analítica pra insumo
      // estimado — aqui sinaliza que o item (ou o grupo inteiro) ainda não
      // tem preço fechado, mesmo aparecendo somado na planilha.
      if (estimado) {
        cellData.cell.styles.fillColor = '#fef3c7'
        cellData.cell.styles.textColor = '#92400e'
        if (node.tipo === 'grupo') cellData.cell.styles.fontStyle = 'bold'
        return
      }
      if (node.tipo === 'grupo') {
        cellData.cell.styles.fillColor = GROUP_FILL
        cellData.cell.styles.fontStyle = 'bold'
        return
      }
      if (cellData.column.index === abcColIndex && node.classeAbc) {
        cellData.cell.styles.fillColor = ABC_BG[node.classeAbc]
        cellData.cell.styles.textColor = ABC_FG[node.classeAbc]
        cellData.cell.styles.fontStyle = 'bold'
      }
    },
  })
}

// ─── Seção: Curva ABC ─────────────────────────────────────────────────────────

async function drawAbcSection(doc: jsPDF, items: AbcItem[], numero: string, title: string, margin: number, contentW: number, subtitle: string) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage('a4', 'landscape')
  addSectionBanner(doc, margin, contentW, numero, title, subtitle)

  const cardY = margin + 16 + 4
  const cardH = drawAbcKpiCards(doc, items, margin, cardY, contentW, CADERNO_KPI_PRIMARY)

  const chartTitleY = cardY + cardH + 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor('#374151')
  doc.text('Curva ABC Acumulada', margin, chartTitleY)

  const chartY = chartTitleY + 2
  const chartH = 58
  drawAbcChart(doc, items, margin, chartY, contentW, chartH)

  const tableStartY = chartY + chartH + 6
  autoTable(doc, {
    startY: tableStartY,
    margin: { left: margin, right: margin, bottom: margin },
    head: abcTableHead(),
    body: abcTableBody(items),
    foot: abcTableFoot(items),
    showFoot: 'lastPage',
    styles: { fontSize: 7, cellPadding: 1.2, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: BRAND_PRIMARY, textColor: '#ffffff', fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', lineWidth: 0.1 },
    columnStyles: abcTableColumnStyles,
    didParseCell: (cellData) => {
      if (cellData.section !== 'body') return
      const classe = (cellData.row.raw as string[])[9]
      cellData.cell.styles.fillColor = abcRowFillColor(classe)
      if (cellData.column.index === 9) {
        cellData.cell.styles.textColor = abcRowTextColor(classe)
        cellData.cell.styles.fontStyle = 'bold'
        cellData.cell.styles.halign = 'center'
      }
    },
  })
}

// ─── Seção: Planilha Analítica ────────────────────────────────────────────────

async function drawPlanilhaAnaliticaSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, subtitle: string, numero: string, destacarEstimados: boolean) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage('a4', 'landscape')
  addSectionBanner(doc, margin, contentW, numero, 'PLANILHA ANALÍTICA DE PREÇOS UNITÁRIOS', subtitle)

  const rows = data.planilhaAnalitica

  if (rows.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text('Nenhum item com composição detalhada neste orçamento.', margin, margin + 16 + 10)
    return
  }

  const body: RowInput[] = rows.map(row => {
    if (row.tipo === 'grupo') {
      return [{
        content: `${row.numero}   ${row.descricao}`,
        colSpan: 8,
        styles: { fillColor: BRAND_PRIMARY, textColor: '#ffffff', fontStyle: 'bold', halign: 'left' },
      }]
    }
    if (row.tipo === 'item') {
      return [row.numero, row.codigo, row.descricao, row.unidade, '', fmt(row.custoUnitario), fmt(row.custoTotal), row.classeAbc ?? '']
    }
    return [
      '',
      row.codigo,
      row.descricao,
      row.unidade,
      row.indice.toLocaleString('pt-BR', { maximumFractionDigits: 6 }),
      fmt(row.custoUnit),
      fmt(row.custoTotal),
      '',
    ]
  })

  autoTable(doc, {
    startY: margin + 16 + 4,
    margin: { left: margin, right: margin, bottom: margin },
    head: [['Item', 'Código', 'Descrição', 'Und', 'Índice', 'R$ Unit.', 'R$ Total', 'ABC']],
    body,
    rowPageBreak: 'avoid',
    styles: { fontSize: 6.5, cellPadding: 1, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
    headStyles: { fillColor: BRAND_PRIMARY, textColor: '#ffffff', fontStyle: 'bold', halign: 'center', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 20 },
      2: { cellWidth: 121 },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 35, halign: 'right' },
      6: { cellWidth: 35, halign: 'right' },
      7: { cellWidth: 10, halign: 'center' },
    },
    didParseCell: (cellData) => {
      if (cellData.section !== 'body') return
      const row = rows[cellData.row.index]
      if (row.tipo === 'insumo') {
        if (destacarEstimados && row.estimado) {
          cellData.cell.styles.fillColor = '#fef3c7'
          cellData.cell.styles.textColor = '#92400e'
          cellData.cell.styles.fontStyle = 'bold'
        }
        return
      }
      if (row.tipo !== 'item') return
      cellData.cell.styles.fillColor = '#e2e8f0'
      cellData.cell.styles.fontStyle = 'bold'
      if (cellData.column.index === 7 && row.classeAbc) {
        cellData.cell.styles.fillColor = ABC_BG[row.classeAbc]
        cellData.cell.styles.textColor = ABC_FG[row.classeAbc]
      }
    },
  })
}

// ─── Seção: Lista de Insumos ──────────────────────────────────────────────────

async function drawListaInsumosSection(doc: jsPDF, data: CadernoData, margin: number, contentW: number, pageH: number, subtitle: string, numero: string) {
  const { autoTable } = await import('jspdf-autotable')

  doc.addPage('a4', 'landscape')
  addSectionBanner(doc, margin, contentW, numero, 'LISTA DE INSUMOS', subtitle)

  let y = margin + 16 + 6

  for (const grupo of data.listaInsumos) {
    const headerH = 8
    if (y + headerH + 10 > pageH - margin && y > margin + 30) {
      doc.addPage()
      y = margin
    }

    doc.setFillColor(BRAND_SECONDARY)
    doc.rect(margin, y, contentW, headerH, 'F')
    doc.setTextColor('#ffffff')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(`${grupo.label.toUpperCase()} (${grupo.items.length} itens)`, margin + 2, y + 5.5)

    y += headerH

    const totalGrupo = grupo.items.reduce((s, i) => s + i.total, 0)

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin, bottom: margin },
      head: [['Grupo', 'Código', 'Descrição', 'Und', 'Quantidade', 'Preço (R$)', 'Total (R$)']],
      body: grupo.items.map(i => [i.grupo, i.codigo, i.descricao, i.unidade, fmtQtd(i.quantidade), fmt(i.custo), fmt(i.total)]),
      foot: [['', '', '', '', '', 'TOTAL DO GRUPO', fmt(totalGrupo)]],
      showFoot: 'lastPage',
      styles: { fontSize: 7, cellPadding: 1.2, valign: 'middle', overflow: 'linebreak', lineColor: '#cbd5e1', lineWidth: 0.1 },
      headStyles: { fillColor: BRAND_PRIMARY, textColor: '#ffffff', fontStyle: 'bold', halign: 'center' },
      footStyles: { fillColor: '#f1f5f9', textColor: '#1e293b', fontStyle: 'bold', halign: 'right', lineWidth: 0.1 },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 24 },
        2: { cellWidth: 119 },
        3: { cellWidth: 14, halign: 'center' },
        4: { cellWidth: 28, halign: 'right' },
        5: { cellWidth: 28, halign: 'right' },
        6: { cellWidth: 30, halign: 'right' },
      },
    })

    // @ts-expect-error lastAutoTable é injetado em runtime pelo plugin jspdf-autotable
    y = doc.lastAutoTable.finalY + 4
  }

  if (data.listaInsumos.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text('Nenhum insumo cadastrado neste orçamento.', margin, y + 4)
  }
}

// ─── PDF principal ────────────────────────────────────────────────────────────

export interface ExportCadernoOptions {
  /** Default true — colore de âmbar as linhas de insumo estimado na Planilha Analítica (8.0). */
  destacarNaAnalitica?: boolean
  /** Default true — inclui a listagem de serviços com insumo de preço estimado em "(B) Serviços Estimados" (3.0). O total (B) nunca muda — só afeta quais linhas aparecem. */
  incluirServicosComInsumoEstimado?: boolean
  /** IDs (orcamento_estrutura.id) de serviços com insumo estimado a ocultar da listagem — escolha feita no modal "Configurar..." (Relatórios), nunca salva no orçamento. Só tem efeito se incluirServicosComInsumoEstimado !== false. */
  servicosComInsumoEstimadoOcultos?: string[]
}

export async function exportCadernoPdf(data: CadernoData, options: ExportCadernoOptions = {}) {
  const { jsPDF } = await import('jspdf')

  // Capa e divisórias de seção ficam em retrato (A4) — pedido explícito pra
  // parecerem "folhas de rosto", não planilha. O conteúdo de cada seção
  // (tabelas largas, KPI cards + gráfico lado a lado) continua em paisagem,
  // que é o espaço que esse conteúdo sempre precisou. doc.addPage(formato,
  // orientação) troca a orientação por página; sem argumentos ela herda a
  // última usada — por isso todo addPage() dentro das seções abaixo é
  // explícito ('a4','landscape'), nunca "pelado".
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 10
  const landscapeW = pageH
  const landscapeH = pageW
  const contentW = landscapeW - margin * 2

  const subtitle = [
    [data.orcamento.codigo, data.orcamento.nome_obra].filter(Boolean).join(' - '),
    `Gerado em ${formatDate(new Date())}`,
  ].filter(Boolean).join('   •   ')

  const SEM_DADOS = 'Seção sem dados disponíveis no software'

  function divider(numero: string, titulo: string, sub?: string) {
    addDivider(doc, pageW, pageH, numero, titulo, sub)
  }

  // Capa
  await addCoverPage(doc, data, pageW, pageH)

  // 1.0 Carta de Apresentação (placeholder)
  divider('1.0', 'CARTA DE APRESENTAÇÃO', SEM_DADOS)

  // 2.0 Lista de Projetos (placeholder)
  divider('2.0', 'LISTA DE PROJETOS', SEM_DADOS)

  // 3.0 Resumo Geral do Orçamento — inclui (B) Serviços Estimados, que já
  // reúne tanto itens "- Estimado" quanto serviços com insumo de preço
  // estimado na cotação (ver detectarEstimados em getCadernoData).
  divider('3.0', 'RESUMO GERAL DO ORÇAMENTO', 'Detalhamento dos Custos')
  await drawResumoGeralSection(
    doc, data, margin, contentW, subtitle, '3.0',
    options.incluirServicosComInsumoEstimado ?? true,
    new Set(options.servicosComInsumoEstimadoOcultos ?? []),
  )

  // 4.0 Custo / m²
  divider('4.0', 'CUSTO / M²', 'Áreas e Indicadores de Custo')
  await drawCustoM2Section(doc, data, margin, contentW, subtitle, '4.0')

  // 5.0 Planilha de Preços Unitários
  divider('5.0', 'PLANILHA DE PREÇOS UNITÁRIOS', 'Planilha de Orçamento')
  await drawPlanilhaPrecosSection(doc, data, margin, contentW, subtitle, '5.0')

  // 6.0 Curva ABC Insumos
  divider('6.0', 'CURVA ABC INSUMOS')
  await drawAbcSection(doc, data.abcInsumos, '6.0', 'CURVA ABC INSUMOS', margin, contentW, subtitle)

  // 7.0 Curva ABC de Serviços
  divider('7.0', 'CURVA ABC DE SERVIÇOS')
  await drawAbcSection(doc, data.abcServicos, '7.0', 'CURVA ABC DE SERVIÇOS', margin, contentW, subtitle)

  // 8.0 Planilha Analítica de Preços Unitários
  divider('8.0', 'PLANILHA ANALÍTICA DE PREÇOS UNITÁRIOS')
  await drawPlanilhaAnaliticaSection(doc, data, margin, contentW, subtitle, '8.0', options.destacarNaAnalitica ?? true)

  // 9.0 Lista de Insumos
  divider('9.0', 'LISTA DE INSUMOS', 'Equipamento, Mão de Obra, Material e Serviço de Terceiros')
  await drawListaInsumosSection(doc, data, margin, contentW, landscapeH, subtitle, '9.0')

  // 10.0 Anexos (placeholder)
  divider('10.0', 'ANEXOS', SEM_DADOS)

  // 11.0 Cotações (placeholder)
  divider('11.0', 'COTAÇÕES', SEM_DADOS)

  // ── Rodapé com numeração de página (a partir da capa) ───────────────────────
  // Página mistura retrato (capa/divisórias) e paisagem (conteúdo), então o
  // tamanho tem que ser lido por página (setPage + pageSize), nunca um
  // pageW/pageH fixo do topo da função.
  const pageCount = doc.getNumberOfPages()
  for (let p = 2; p <= pageCount; p++) {
    doc.setPage(p)
    const pw = doc.internal.pageSize.getWidth()
    const ph = doc.internal.pageSize.getHeight()
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(PDF_COLORS.textGray)
    doc.text(`Página ${p - 1} de ${pageCount - 1}`, pw - margin, ph - 4, { align: 'right' })
  }

  doc.save(`${slugFilename(data.orcamento.nome_obra, 'caderno_orcamento')}_caderno_${new Date().toISOString().split('T')[0]}.pdf`)
}
