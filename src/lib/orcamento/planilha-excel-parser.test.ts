import { describe, it, expect } from 'vitest'
import { normNum, getLevel, parseMatrix, parseBrNumber, matrixFromCsv, construirAba, sugerirMapeamento, type Mapeamento } from './planilha-excel-parser'

// Achado real: .xlsx que nasceu de uma conversão de .csv não reconhece a
// célula de custo como numérica e a mantém como TEXTO já em ponto-decimal
// (ex.: "650.62", às vezes com um zero a mais: "650.620") — parseBrNumber
// assumia incondicionalmente que todo texto era formato BR (ponto = milhar)
// e removia o ponto antes de converter, virando 65062/650620 em vez de
// 650.62. O mesmo arquivo como .csv genuíno (célula com vírgula BR de
// verdade, "650,62") sempre funcionou.
describe('parseBrNumber', () => {
  it('número nativo do xlsx (célula numérica de verdade) passa direto', () => {
    expect(parseBrNumber(650.62)).toBe(650.62)
  })

  it('texto BR com vírgula decimal', () => {
    expect(parseBrNumber('650,62')).toBe(650.62)
  })

  it('texto BR com milhar (ponto) e decimal (vírgula)', () => {
    expect(parseBrNumber('1.650,62')).toBe(1650.62)
  })

  it('texto em ponto-decimal (sem vírgula) não deve ter o ponto removido', () => {
    expect(parseBrNumber('650.62')).toBe(650.62)
  })

  it('texto em ponto-decimal com 3 casas continua correto (achado real)', () => {
    expect(parseBrNumber('650.620')).toBe(650.62)
  })

  it('prefixo R$, traço e vazio', () => {
    expect(parseBrNumber('R$ 650,62')).toBe(650.62)
    expect(parseBrNumber('-')).toBe(0)
    expect(parseBrNumber('')).toBe(0)
    expect(parseBrNumber(undefined)).toBe(0)
  })
})

// Achado real: export de orçamento em .csv escreve a coluna de numeração
// (Item) como ="01"/="01.01" — sintaxe do Excel pra forçar a célula como
// texto (preserva o zero à esquerda, que senão viraria o número 1). Um
// strip de aspas ingênuo (remove só um lado) deixava ="01 (com o "=" e uma
// aspas sobrando), que não batia no regex de numeração válida e derrubava
// TODA linha do arquivo como "numero inválido" — a importação inteira
// não reconhecia o arquivo.
describe('matrixFromCsv — célula forçada como texto (Excel ="valor")', () => {
  it('desembrulha ="01" pro valor puro "01"', () => {
    expect(matrixFromCsv('="01";CC1618;LIMPEZA DO TERRENO')[0]).toEqual(['01', 'CC1618', 'LIMPEZA DO TERRENO'])
  })

  it('desembrulha numeração de múltiplos níveis', () => {
    expect(matrixFromCsv('="01.01";;DESCRIÇÃO')[0]).toEqual(['01.01', '', 'DESCRIÇÃO'])
  })

  it('continua removendo aspas de célula comum (sem "=")', () => {
    expect(matrixFromCsv('"SERVIÇOS INICIAIS"')[0]).toEqual(['SERVIÇOS INICIAIS'])
  })

  it('célula sem aspas nem "=" não é alterada', () => {
    expect(matrixFromCsv('CC1618')[0]).toEqual(['CC1618'])
  })
})

describe('parseMatrix — arquivo real com título antes do cabeçalho + numeração em ="..."', () => {
  // Recorte fiel do arquivo real que disparou o achado acima: 2 linhas de
  // título, 1 linha em branco, cabeçalho, 1 grupo, 1 item, linha de total
  // (numero vazio) e linha em branco.
  const csv = [
    'GALÍCIA - ESTACIONAMENTO SEDE - R01',
    'ESTACIONAMENTO SEDE - R01',
    '',
    'Item;Código;Origem;Descrição;Unidade;Quantidade;Custo Unitário;Total',
    '="01";;;SERVIÇOS INICIAIS DE OBRA;;;;',
    '="01.01";CC1618;Este Projeto;LIMPEZA DO TERRENO;M2;650,620000;8,59;"=ARRED(F7*G7;2)"',
    ';;;;;;;',
    ';;;TOTAL ITEM: 01;;;;=SOMA(H7:H8)',
  ].join('\n')

  it('acha o cabeçalho na linha 4 (pula as 2 linhas de título + branco)', () => {
    const matrix = matrixFromCsv(csv)
    const aba = construirAba('arquivo', matrix)
    expect(aba.linhaCabecalho).toBe(3)
    expect(aba.header).toEqual(['Item', 'Código', 'Origem', 'Descrição', 'Unidade', 'Quantidade', 'Custo Unitário', 'Total'])
  })

  it('mapeia as colunas automaticamente e importa grupo + item sem nenhuma linha rejeitada como "numero_invalido"', () => {
    const matrix = matrixFromCsv(csv)
    const aba = construirAba('arquivo', matrix)
    const mapa = sugerirMapeamento(aba.header)
    const { rows, ignoradas } = parseMatrix(matrix, mapa, aba.linhaCabecalho + 1)

    expect(ignoradas.find(i => i.motivo === 'numero_invalido')).toBeUndefined()
    expect(rows).toEqual([
      { numero: '01', nivel: 1, codigo: null, descricao: 'SERVIÇOS INICIAIS DE OBRA', unidade: null, quantidade: null, custo_unitario: null, tipo: 'grupo', ordem: 0 },
      { numero: '01.01', nivel: 2, codigo: 'CC1618', descricao: 'LIMPEZA DO TERRENO', unidade: 'M2', quantidade: 650.62, custo_unitario: 8.59, tipo: 'item', ordem: 1 },
    ])
    // linha em branco + linha de total (numero vazio) — ignoradas, não como erro
    expect(ignoradas.map(i => i.motivo).sort()).toEqual(['sem_numero', 'vazia'])
  })
})

// Achado real: planilha "Topo de Minas" (cad orçamento_Topo-Minas_R02_exe.xlsx,
// aba "ORÇAMENTO EXE") escreve o capítulo de nível 1 como "1." (com ponto
// final) e os filhos como "1.1", "1.2" — sem o ponto. Sem o fix, normNum("1.")
// virava "1.NaN" (split por "." gera um segmento vazio, parseInt("") é NaN),
// colocando o capítulo no MESMO nível dos próprios filhos e quebrando o
// parent_id de toda a árvore na importação (capítulo e filhos ficavam órfãos).
describe('normNum', () => {
  it('normaliza número com ponto final (capítulo) igual ao mesmo número sem ponto', () => {
    expect(normNum('1.')).toBe('1')
    expect(normNum('12.')).toBe('12')
  })

  it('não afeta números normais de múltiplos níveis', () => {
    expect(normNum('1.1')).toBe('1.1')
    expect(normNum('3.1.1')).toBe('3.1.1')
  })

  it('remove zeros à esquerda de cada segmento', () => {
    expect(normNum('01.02')).toBe('1.2')
  })
})

describe('getLevel', () => {
  it('capítulo com ponto final fica no nível 1, igual ao mesmo capítulo sem ponto', () => {
    expect(getLevel(normNum('1.'))).toBe(1)
    expect(getLevel(normNum('1'))).toBe(1)
  })

  it('filho de um capítulo com ponto final fica um nível abaixo do pai', () => {
    const nivelPai = getLevel(normNum('1.'))
    const nivelFilho = getLevel(normNum('1.1'))
    expect(nivelFilho).toBe(nivelPai + 1)
  })
})

describe('parseMatrix — hierarquia com capítulo terminado em ponto', () => {
  const mapa: Mapeamento = { numero: 0, codigo: null, descricao: 1, unidade: null, quantidade: null, custo_unitario: null }

  it('capítulo "1." e filho "1.1" saem com níveis consistentes (1 e 2)', () => {
    const matrix = [
      ['ITEM', 'DESCRIÇÃO'],
      ['1.', 'TAXA DE ADMINISTRAÇÃO'],
      ['1.1', 'TAXA DE ADMINISTRAÇÃO - Custo fixo mensal'],
      ['2.', 'CANTEIRO DE OBRAS'],
      ['2.1', 'PLACA DE OBRA'],
    ]
    const { rows, ignoradas } = parseMatrix(matrix, mapa, 1)
    expect(ignoradas).toHaveLength(0)
    expect(rows.map(r => ({ numero: r.numero, nivel: r.nivel }))).toEqual([
      { numero: '1.', nivel: 1 },
      { numero: '1.1', nivel: 2 },
      { numero: '2.', nivel: 1 },
      { numero: '2.1', nivel: 2 },
    ])
  })
})
