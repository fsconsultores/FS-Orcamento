// ─── Categorias fixas do gráfico "Distribuição dos Custos (A)" ──────────────
// Lista fixa de categorias usada no gráfico de rosca do Caderno de Orçamento,
// seguindo o modelo de referência. Cada grupo de nível 1 do orçamento é
// mapeado para uma destas categorias (configurável em Configurações), com
// fallback para "Outros" quando não mapeado/sugerido.

export const CATEGORIAS_DISTRIBUICAO_CUSTOS = [
  'CONSULTORIAS',
  'CANTEIRO',
  'MÃO DE OBRA INDIRETO',
  'EQUIPAMENTOS E CONSUMOS',
  'SERVIÇOS INICIAIS',
  'TERRAPLENAGEM E DRENAGEM',
  'CONTENÇÃO E FUNDAÇÃO',
  'ESTRUTURA E COBERTURA',
  'ALVENARIAS E MASSAS',
  'ESQUADRIAS',
  'ACABAMENTO INTERNO',
  'REVESTIMENTO EXTERNO',
  'INSTALAÇÕES ELÉTRICAS',
  'INSTALAÇÕES HIDRÁULICAS E PCI',
  'CLIMATIZAÇÃO',
  'PAVIMENTAÇÃO EXTERNA',
  'PAISAGISMO',
] as const

export const CATEGORIA_OUTROS = 'Outros'

export const CORES_DISTRIBUICAO_CUSTOS: Record<string, string> = {
  'CONSULTORIAS': '#1f4e79',
  'CANTEIRO': '#c55a11',
  'MÃO DE OBRA INDIRETO': '#548235',
  'EQUIPAMENTOS E CONSUMOS': '#7c4180',
  'SERVIÇOS INICIAIS': '#bf8f00',
  'TERRAPLENAGEM E DRENAGEM': '#2e75b6',
  'CONTENÇÃO E FUNDAÇÃO': '#943634',
  'ESTRUTURA E COBERTURA': '#70ad47',
  'ALVENARIAS E MASSAS': '#264478',
  'ESQUADRIAS': '#9e480e',
  'ACABAMENTO INTERNO': '#636363',
  'REVESTIMENTO EXTERNO': '#a5a5a5',
  'INSTALAÇÕES ELÉTRICAS': '#ffc000',
  'INSTALAÇÕES HIDRÁULICAS E PCI': '#5b9bd5',
  'CLIMATIZAÇÃO': '#ed7d31',
  'PAVIMENTAÇÃO EXTERNA': '#375623',
  'PAISAGISMO': '#8e7cc3',
  [CATEGORIA_OUTROS]: '#a6a6a6',
}

// Sugestão automática por palavras-chave na descrição do grupo, usada como
// valor padrão até o usuário ajustar manualmente em Configurações.
const REGRAS_SUGESTAO: { categoria: string; keywords: string[] }[] = [
  { categoria: 'CONSULTORIAS', keywords: ['CONSULTORIA'] },
  { categoria: 'CANTEIRO', keywords: ['CANTEIRO', 'LIMPEZA FINAL'] },
  { categoria: 'MÃO DE OBRA INDIRETO', keywords: ['MAO DE OBRA INDIRET', 'MÃO DE OBRA INDIRET'] },
  { categoria: 'EQUIPAMENTOS E CONSUMOS', keywords: ['EQUIPAMENTO', 'CONSUMO', 'PROTECAO COLETIVA', 'PROTEÇÃO COLETIVA', 'TRANSPORTE'] },
  { categoria: 'SERVIÇOS INICIAIS', keywords: ['SERVICOS INICIA', 'SERVIÇOS INICIA', 'TOPOGRAF', 'TOPOGRÁF', 'LOCACAO DE OBRA', 'LOCAÇÃO DE OBRA'] },
  { categoria: 'TERRAPLENAGEM E DRENAGEM', keywords: ['TERRAPLENAGEM', 'DRENAGEM'] },
  { categoria: 'CONTENÇÃO E FUNDAÇÃO', keywords: ['FUNDACAO', 'FUNDAÇÃO', 'CONTENCAO', 'CONTENÇÃO'] },
  { categoria: 'ESTRUTURA E COBERTURA', keywords: ['ESTRUTURA', 'COBERTURA'] },
  { categoria: 'ALVENARIAS E MASSAS', keywords: ['ALVENARIA', 'BRUTO', 'MASSA'] },
  { categoria: 'ESQUADRIAS', keywords: ['ESQUADRIA', 'SERRALHERIA'] },
  { categoria: 'ACABAMENTO INTERNO', keywords: ['ACABAMENTO INTERNO', 'BANCADA', 'FORRO', 'DIVISORIA', 'DIVISÓRIA', 'IMPERMEABILIZACAO', 'IMPERMEABILIZAÇÃO', 'PINTURA', 'LOUCA', 'LOUÇA'] },
  { categoria: 'REVESTIMENTO EXTERNO', keywords: ['REVESTIMENTO EXTERNO', 'FACHADA'] },
  { categoria: 'INSTALAÇÕES ELÉTRICAS', keywords: ['ELETRIC', 'ELÉTRIC'] },
  { categoria: 'INSTALAÇÕES HIDRÁULICAS E PCI', keywords: ['HIDRO', 'HIDRAULIC', 'HIDRÁULIC', 'SANITARI', 'SANITÁRI', 'INCENDIO', 'INCÊNDIO', 'PCI'] },
  { categoria: 'CLIMATIZAÇÃO', keywords: ['CLIMATIZACAO', 'CLIMATIZAÇÃO', 'AR CONDICIONADO'] },
  { categoria: 'PAVIMENTAÇÃO EXTERNA', keywords: ['PAVIMENTACAO', 'PAVIMENTAÇÃO'] },
  { categoria: 'PAISAGISMO', keywords: ['PAISAGISMO'] },
]

/** Sugere uma das categorias fixas a partir da descrição de um grupo de nível 1, com fallback para "Outros". */
export function sugerirCategoria(descricao: string): string {
  const d = descricao.toUpperCase()
  for (const { categoria, keywords } of REGRAS_SUGESTAO) {
    if (keywords.some(k => d.includes(k))) return categoria
  }
  return CATEGORIA_OUTROS
}
