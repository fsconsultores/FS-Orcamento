import type { SupabaseClient } from '@supabase/supabase-js'

export interface SugestaoCotacao {
  codigo: string
  valor: number
  fornecedor: string | null
  data_cotacao: string | null
  orcamentoId: string
  orcamentoNome: string
}

interface CotacaoRow {
  codigo: string
  valor: number
  fornecedor: string | null
  data_cotacao: string | null
  created_at: string
  orcamento_id: string
}

/**
 * Sugestão de preço a partir de cotações já registradas em OUTRAS obras
 * para o mesmo código de insumo — resolve a dor de "não lembrar
 * fornecedor/preço de obra passada" sem precisar de nenhuma tabela nova:
 * `orcamento_insumo_cotacoes` já guarda fornecedor+preço+data por
 * (orcamento_id, codigo), e a RLS (`is_authorized_domain()`) já permite
 * leitura cross-orçamento — não há isolamento por obra na policy.
 *
 * `codigos` deve vir restrito aos avulsos SEM preço ainda (custo === 0) do
 * orçamento atual — é exatamente o conjunto que precisa de preenchimento,
 * então a consulta cross-obra já nasce limitada em vez de casar contra
 * milhares de códigos já preenchidos.
 */
export async function getSugestoesCotacaoCrossOrcamento(
  supabase: SupabaseClient,
  orcamentoId: string,
  codigos: string[]
): Promise<Map<string, SugestaoCotacao>> {
  if (codigos.length === 0) return new Map()
  const sb = supabase as any

  const BATCH = 200
  const lotes: string[][] = []
  for (let i = 0; i < codigos.length; i += BATCH) lotes.push(codigos.slice(i, i + BATCH))

  const resultados = await Promise.all(
    lotes.map((chunk) =>
      sb
        .from('orcamento_insumo_cotacoes')
        .select('codigo, valor, fornecedor, data_cotacao, created_at, orcamento_id')
        .in('codigo', chunk)
        .neq('orcamento_id', orcamentoId)
        .is('deleted_at', null)
    )
  )
  const linhas: CotacaoRow[] = []
  for (const { data, error } of resultados) {
    if (error) throw new Error(`Erro ao buscar sugestões de cotação: ${error.message}`)
    linhas.push(...((data ?? []) as CotacaoRow[]))
  }
  if (linhas.length === 0) return new Map()

  // Mantém só a cotação mais recente por código — data_cotacao (informada
  // pelo usuário) tem prioridade; created_at desempata quando data_cotacao
  // é igual ou ausente em ambas.
  const chave = (row: CotacaoRow) => `${row.data_cotacao ?? ''}|${row.created_at}`
  const melhores = new Map<string, CotacaoRow>()
  for (const linha of linhas) {
    const atual = melhores.get(linha.codigo)
    if (!atual || chave(linha) > chave(atual)) melhores.set(linha.codigo, linha)
  }

  const orcamentoIds = [...new Set([...melhores.values()].map((l) => l.orcamento_id))]
  const { data: orcamentos, error: orcErr } = await sb
    .from('tabela_orcamentos')
    .select('id, nome_obra')
    .in('id', orcamentoIds)
  if (orcErr) throw new Error(`Erro ao buscar obras de origem das sugestões: ${orcErr.message}`)
  const nomePorId = new Map<string, string>((orcamentos ?? []).map((o: { id: string; nome_obra: string }) => [o.id, o.nome_obra]))

  const resultado = new Map<string, SugestaoCotacao>()
  for (const [codigo, linha] of melhores) {
    resultado.set(codigo, {
      codigo,
      valor: linha.valor,
      fornecedor: linha.fornecedor,
      data_cotacao: linha.data_cotacao,
      orcamentoId: linha.orcamento_id,
      orcamentoNome: nomePorId.get(linha.orcamento_id) ?? 'outra obra',
    })
  }
  return resultado
}
