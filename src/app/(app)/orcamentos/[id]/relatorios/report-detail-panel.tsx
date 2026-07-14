'use client'

import { useMemo, useState } from 'react'
import type { CadernoData } from '@/lib/orcamento/caderno'
import type { AbcItem } from '@/lib/curva-abc'
import { fmt as fmtCurrency, fmtPct, fmtQtd } from '@/lib/curva-abc'
import { REPORT_CATALOG, type ReportDef, type ReportFormat, type CurvaAbcTab } from './report-catalog'
import { Badge } from '@/components/ui/badge'
import { PlanilhaSelector, type EscopoPlanilha, type PlanilhaResumo } from './filters/planilha-selector'
import { AnaliticaFilters } from './filters/analitica-filters'
import { defaultAnaliticaFilterState, buildAnaliticaRows, exportPlanilhaAnaliticaXlsx } from './exporters/export-planilha-analitica'
import { exportPlanilhaSinteticaXlsx, countPlanilhaSinteticaItens, previewPlanilhaSintetica } from './exporters/export-planilha-sintetica'
import { exportCurvaAbcXlsx } from './exporters/export-curva-abc-xlsx'
import { CadernoInfoForm } from './caderno-info-form'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'

const CADERNO_SECOES = [
  'Capa', 'Resumo executivo', 'Custo por m²', 'Planilha de preços',
  'Curva ABC de Serviços', 'Curva ABC de Insumos', 'Planilha Analítica',
  'Lista de Insumos', 'Anexos / Cotações',
]

const ABC_TAB_LABELS: Record<CurvaAbcTab, string> = {
  geral: 'Curva ABC', materiais: 'Curva ABC - Materiais', mao_de_obra: 'Curva ABC - Mão de Obra',
  equipamentos: 'Curva ABC - Equipamentos', servicos: 'Curva ABC - Serviços', insumos: 'Curva ABC - Insumos',
}

interface ServicoEstimadoManual {
  id?: string
  descricao: string
  valor: number
}

interface Props {
  orcamentoId: string
  report: ReportDef
  data: CadernoData
  planilhas: PlanilhaResumo[]
  planilhaAtualId: string | null
  escopo: EscopoPlanilha
  planilhaIds: string[]
  onEscopoChange: (escopo: EscopoPlanilha, selecionadas: string[]) => void
  pendingEscopo: boolean
  servicosEstimadosManuais: ServicoEstimadoManual[]
}

function getAbcItems(data: CadernoData, tab: CurvaAbcTab): AbcItem[] {
  if (tab === 'geral') return data.abcGeral
  if (tab === 'insumos') return data.abcInsumos
  if (tab === 'servicos') return data.abcServicos
  return data.abcGeral.filter(i => i.categoria === tab)
}

export function ReportDetailPanel({ orcamentoId, report, data, planilhas, planilhaAtualId, escopo, planilhaIds, onEscopoChange, pendingEscopo, servicosEstimadosManuais }: Props) {
  const [formato, setFormato] = useState<ReportFormat>(report.formats[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [analitica, setAnalitica] = useState(defaultAnaliticaFilterState())

  const analiticaRows = useMemo(
    () => (report.kind.type === 'planilha-analitica' ? buildAnaliticaRows(data, analitica) : null),
    [report.kind, data, analitica]
  )
  const abcItems = report.kind.type === 'curva-abc' ? getAbcItems(data, report.kind.tab) : null

  async function handleExport() {
    setLoading(true); setError(null)
    try {
      if (report.kind.type === 'planilha-sintetica') {
        await exportPlanilhaSinteticaXlsx(data)
      } else if (report.kind.type === 'planilha-analitica') {
        await exportPlanilhaAnaliticaXlsx(data, analitica)
      } else if (report.kind.type === 'caderno') {
        const { exportCadernoPdf } = await import('../caderno/export-caderno-pdf')
        await exportCadernoPdf(data)
      } else if (report.kind.type === 'curva-abc') {
        const items = getAbcItems(data, report.kind.tab)
        if (formato === 'xlsx') {
          await exportCurvaAbcXlsx(items, ABC_TAB_LABELS[report.kind.tab], `curva_abc_${report.kind.tab}`)
        } else {
          const { exportCurvaAbcPdf } = await import('../curva-abc/export-pdf')
          await exportCurvaAbcPdf(items, report.kind.tab, data.orcamento.nome_obra)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gerar o arquivo. Tente novamente em alguns segundos.')
    } finally {
      setLoading(false)
    }
  }

  const registros = report.kind.type === 'planilha-sintetica' ? `${countPlanilhaSinteticaItens(data)} itens`
    : report.kind.type === 'planilha-analitica' ? `${analiticaRows?.length ?? 0} linhas`
    : report.kind.type === 'caderno' ? `${data.arvore.length} grupos de nível 1`
    : `${abcItems?.length ?? 0} itens`

  return (
    <div className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3 border-b border-gray-100 p-5">
        <div className="mt-0.5 flex-shrink-0 w-12 h-12 rounded-lg bg-primary-50 flex items-center justify-center text-primary-700">
          {report.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-600">
            {REPORT_CATALOG.find(c => c.id === report.categoryId)?.label ?? 'Relatório'}
          </p>
          <h3 className="text-lg font-semibold text-gray-900 mt-0.5">{report.title}</h3>
          <p className="text-sm text-gray-500 mt-0.5">{report.longDescription}</p>
          <Badge variant="neutral" className="mt-2">{registros}</Badge>
        </div>
      </div>

      {/* Corpo: filtros + prévia */}
      <div className="flex-1 grid md:grid-cols-2 gap-6 p-5 overflow-y-auto">
        <div className="space-y-4">
          {report.kind.type === 'planilha-analitica' && (
            <AnaliticaFilters value={analitica} onChange={setAnalitica} />
          )}
          <PlanilhaSelector
            planilhas={planilhas}
            planilhaAtualId={planilhaAtualId}
            escopo={escopo}
            selecionadas={planilhaIds}
            onChange={onEscopoChange}
            pending={pendingEscopo}
          />
          {report.kind.type === 'caderno' && (
            <>
              <CadernoInfoForm
                orcamentoId={orcamentoId}
                nomeObra={data.orcamento.nome_obra}
                codigo={data.orcamento.codigo}
                cliente={data.orcamento.cliente}
                local={data.orcamento.local}
                data={data.orcamento.data ?? ''}
                areaTotal={data.orcamento.area_total}
                areaCoberta={data.orcamento.area_coberta}
                areaEquivalente={data.orcamento.area_equivalente}
                servicosEstimados={servicosEstimadosManuais}
              />
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Seções incluídas</p>
                <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
                  {CADERNO_SECOES.map(s => <li key={s}>{s}</li>)}
                </ul>
              </div>
            </>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">Prévia</p>
          <Preview report={report} data={data} analiticaRows={analiticaRows} abcItems={abcItems} analitica={analitica} />
        </div>
      </div>

      {/* Rodapé: formato + exportar */}
      <div className="border-t border-gray-100 p-5 space-y-3">
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-gray-700">Formato:</span>
          {(['xlsx', 'pdf'] as ReportFormat[]).map(f => {
            const disponivel = report.formats.includes(f) && !(f === 'pdf' && report.pdfComingSoon)
            return (
              <label key={f} className={`flex items-center gap-1.5 text-sm ${disponivel ? 'text-gray-700 cursor-pointer' : 'text-gray-300 cursor-not-allowed'}`}>
                <input type="radio" name="formato" className="accent-primary-600" disabled={!disponivel}
                  checked={formato === f} onChange={() => setFormato(f)} />
                {f === 'xlsx' ? 'Excel' : 'PDF'}
                {f === 'pdf' && report.pdfComingSoon && <span className="text-[10px] text-amber-500">(em breve)</span>}
              </label>
            )
          })}
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleExport}
            disabled={escopo === 'selecionar' && planilhaIds.length === 0}
            loading={loading}
            icon={<Download size={15} />}
          >
            Exportar
          </Button>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  )
}

function Preview({ report, data, analiticaRows, abcItems, analitica }: {
  report: ReportDef
  data: CadernoData
  analiticaRows: ReturnType<typeof buildAnaliticaRows> | null
  abcItems: AbcItem[] | null
  analitica: ReturnType<typeof defaultAnaliticaFilterState>
}) {
  if (report.kind.type === 'planilha-sintetica') {
    const rows = previewPlanilhaSintetica(data, 8)
    return (
      <PreviewTable>
        {rows.map((r, i) => (
          <tr key={i} className={r.tipo === 'grupo' ? 'font-medium text-gray-800' : 'text-gray-600'}>
            <td className="py-1 pr-2 whitespace-nowrap">{r.numero}</td>
            <td className="py-1 pr-2 truncate" style={{ paddingLeft: r.depth * 10 }}>{r.descricao}</td>
            <td className="py-1 text-right whitespace-nowrap">{r.total > 0 ? fmtCurrency(r.total) : ''}</td>
          </tr>
        ))}
      </PreviewTable>
    )
  }

  if (report.kind.type === 'planilha-analitica') {
    const rows = (analiticaRows ?? []).slice(0, 10)
    const mostrarTotalItem = analitica.modo !== 'agrupada'
    return (
      <PreviewTable>
        {rows.map((r, i) => (
          <tr key={i} className={r.tipo === 'grupo' ? 'font-medium text-gray-800' : r.tipo === 'item' ? 'text-gray-700' : 'text-gray-500'}>
            <td className="py-1 pr-2 truncate">
              {r.tipo === 'insumo' ? '　'.repeat(r.nivel) + r.descricao : r.descricao}
            </td>
            {mostrarTotalItem && (
              <td className="py-1 pr-2 text-right whitespace-nowrap text-gray-400">
                {r.tipo === 'item' && r.quantidade > 0 ? `${fmtQtd(r.quantidade)} ${r.unidade}`.trim()
                  : r.tipo === 'insumo' && r.indice > 0 ? fmtQtd(r.indice) : ''}
              </td>
            )}
            {mostrarTotalItem && (
              <td className="py-1 pr-2 text-right whitespace-nowrap text-gray-400">
                {r.tipo === 'insumo' && r.quantidadeTotalItem > 0 ? `${fmtQtd(r.quantidadeTotalItem)} ${r.unidade}`.trim() : ''}
              </td>
            )}
            <td className="py-1 text-right whitespace-nowrap">
              {r.tipo === 'item' && r.custoTotal > 0 ? fmtCurrency(r.custoTotal) : r.tipo === 'insumo' && r.custoTotal > 0 ? fmtCurrency(r.custoTotal) : ''}
            </td>
          </tr>
        ))}
      </PreviewTable>
    )
  }

  if (report.kind.type === 'curva-abc' && abcItems) {
    const rows = abcItems.slice(0, 8)
    return (
      <PreviewTable>
        {rows.map((item, i) => (
          <tr key={i} className="text-gray-600">
            <td className="py-1 pr-2 whitespace-nowrap text-gray-400">{item.classe}</td>
            <td className="py-1 pr-2 truncate">{item.descricao}</td>
            <td className="py-1 pr-2 text-right whitespace-nowrap">{fmtCurrency(item.valor_total)}</td>
            <td className="py-1 text-right whitespace-nowrap text-gray-400">{fmtPct(item.percentual_acumulado)}</td>
          </tr>
        ))}
      </PreviewTable>
    )
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
      Documento com múltiplas seções — sem prévia tabular.
    </div>
  )
}

function PreviewTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full text-xs">
        <tbody className="divide-y divide-gray-50">
          {children}
        </tbody>
      </table>
    </div>
  )
}
