import type { ReactNode } from 'react'

export type ReportFormat = 'xlsx' | 'pdf'
export type ReportCategoryId = 'planilhas' | 'curva-abc' | 'outros'
export type CurvaAbcTab = 'geral' | 'materiais' | 'mao_de_obra' | 'equipamentos' | 'servicos' | 'insumos'

export type ReportKind =
  | { type: 'planilha-sintetica' }
  | { type: 'planilha-analitica' }
  | { type: 'caderno' }
  | { type: 'curva-abc'; tab: CurvaAbcTab }

export interface ReportDef {
  id: string
  categoryId: ReportCategoryId
  title: string
  shortDescription: string
  longDescription: string
  icon: ReactNode
  formats: ReportFormat[]
  /** true = PDF ainda não implementado; aparece desabilitado com aviso "em breve" */
  pdfComingSoon?: boolean
  kind: ReportKind
}

export interface ReportCategoryDef {
  id: ReportCategoryId
  label: string
  icon: ReactNode
  reports: ReportDef[]
}

const iconProps = { className: 'w-5 h-5', fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.5 } as const

const IconSintetica = (
  <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
)
const IconAnalitica = (
  <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
)
const IconCaderno = (
  <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
)
const IconAbcGeral = (
  <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
)
const IconInsumos = (
  <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
)
const IconServicos = (
  <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" /></svg>
)
const IconEquipamentos = (
  <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766m-3.704 3.796l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085" /></svg>
)
const IconMateriais = (
  <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" /></svg>
)
const IconMaoDeObra = (
  <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
)
const IconFolder = (
  <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-19.5 0v6a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25v-6m-19.5 0h19.5" /></svg>
)
const IconCategoriaPlanilhas = (
  <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
)
const IconCategoriaAbc = (
  <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>
)

export const REPORT_CATALOG: ReportCategoryDef[] = [
  {
    id: 'planilhas',
    label: 'Planilhas',
    icon: IconCategoriaPlanilhas,
    reports: [
      {
        id: 'planilha-sintetica',
        categoryId: 'planilhas',
        title: 'Planilha Sintética',
        shortDescription: 'Itens, quantidades e preços unitários, sem detalhamento de insumos.',
        longDescription: 'Visão resumida do orçamento: cada grupo e item da planilha com unidade, quantidade, preço unitário e total — sem abrir a composição de insumos.',
        icon: IconSintetica,
        formats: ['xlsx'],
        kind: { type: 'planilha-sintetica' },
      },
      {
        id: 'planilha-analitica',
        categoryId: 'planilhas',
        title: 'Planilha Analítica',
        shortDescription: 'Preços unitários detalhados com a composição de insumos por serviço.',
        longDescription: 'Igual à Sintética, mas mostra também os insumos que compõem cada serviço. Pode ser exportada normal, decompondo sub-composições recursivamente, ou agrupada por tipo de insumo.',
        icon: IconAnalitica,
        formats: ['xlsx', 'pdf'],
        pdfComingSoon: true,
        kind: { type: 'planilha-analitica' },
      },
      {
        id: 'caderno',
        categoryId: 'planilhas',
        title: 'Caderno de Orçamento',
        shortDescription: 'Relatório completo: capa, resumo, planilha, curvas ABC e mais.',
        longDescription: 'Documento completo para impressão/entrega: capa, resumo executivo, custo por m², planilha de preços, planilha analítica, curvas ABC, lista de insumos e anexos.',
        icon: IconCaderno,
        formats: ['pdf'],
        kind: { type: 'caderno' },
      },
    ],
  },
  {
    id: 'curva-abc',
    label: 'Curva ABC',
    icon: IconCategoriaAbc,
    reports: [
      {
        id: 'abc-geral',
        categoryId: 'curva-abc',
        title: 'Curva ABC Geral',
        shortDescription: 'Todos os insumos e serviços de terceiros, classificados por impacto no custo.',
        longDescription: 'Decompõe todo o orçamento até o nível de insumo/serviço de terceiros e classifica cada item em classe A, B ou C pelo percentual acumulado do valor total.',
        icon: IconAbcGeral,
        formats: ['xlsx', 'pdf'],
        kind: { type: 'curva-abc', tab: 'geral' },
      },
      {
        id: 'abc-insumos',
        categoryId: 'curva-abc',
        title: 'Curva ABC de Insumos',
        shortDescription: 'Somente os insumos cadastrados (código de insumo), classificados por impacto.',
        longDescription: 'Mesma decomposição da Curva ABC Geral, restrita aos itens com código de insumo cadastrado (materiais, mão de obra, equipamentos, transportes).',
        icon: IconInsumos,
        formats: ['xlsx', 'pdf'],
        kind: { type: 'curva-abc', tab: 'insumos' },
      },
      {
        id: 'abc-servicos',
        categoryId: 'curva-abc',
        title: 'Curva ABC de Serviços',
        shortDescription: 'Cada serviço/composição da planilha, classificado por impacto no custo total.',
        longDescription: 'Agrega o custo por serviço (item da planilha cujo código é uma composição) e classifica cada um em classe A, B ou C.',
        icon: IconServicos,
        formats: ['xlsx', 'pdf'],
        kind: { type: 'curva-abc', tab: 'servicos' },
      },
      {
        id: 'abc-equipamentos',
        categoryId: 'curva-abc',
        title: 'Curva ABC de Equipamentos',
        shortDescription: 'Somente insumos do grupo Equipamentos, classificados por impacto no custo.',
        longDescription: 'Recorte da Curva ABC Geral filtrado para a categoria Equipamentos.',
        icon: IconEquipamentos,
        formats: ['xlsx', 'pdf'],
        kind: { type: 'curva-abc', tab: 'equipamentos' },
      },
      {
        id: 'abc-materiais',
        categoryId: 'curva-abc',
        title: 'Curva ABC de Materiais',
        shortDescription: 'Somente insumos do grupo Materiais, classificados por impacto no custo.',
        longDescription: 'Recorte da Curva ABC Geral filtrado para a categoria Materiais.',
        icon: IconMateriais,
        formats: ['xlsx', 'pdf'],
        kind: { type: 'curva-abc', tab: 'materiais' },
      },
      {
        id: 'abc-mao-de-obra',
        categoryId: 'curva-abc',
        title: 'Curva ABC de Mão de Obra',
        shortDescription: 'Somente insumos do grupo Mão de Obra, classificados por impacto no custo.',
        longDescription: 'Recorte da Curva ABC Geral filtrado para a categoria Mão de Obra.',
        icon: IconMaoDeObra,
        formats: ['xlsx', 'pdf'],
        kind: { type: 'curva-abc', tab: 'mao_de_obra' },
      },
    ],
  },
  {
    id: 'outros',
    label: 'Outros',
    icon: IconFolder,
    reports: [],
  },
]

export function findReport(id: string): ReportDef | undefined {
  for (const cat of REPORT_CATALOG) {
    const found = cat.reports.find(r => r.id === id)
    if (found) return found
  }
  return undefined
}
