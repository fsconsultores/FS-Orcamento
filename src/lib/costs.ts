
/**
 * Arredonda pra 2 casas decimais (padrão ARRED() do Excel). Usado pra
 * arredondar CADA insumo antes de somar no custo da composição — somar
 * primeiro e arredondar só o total (como o motor fazia antes) diverge do
 * Excel/SINAPI, que arredonda cada linha (ARRED(F*G;2)) e só depois soma
 * (SOMA()); em composições com muitos insumos essa ordem gera diferenças
 * grandes o suficiente pro Caderno não bater com a planilha original.
 */
export function arredondar2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

export function calcularCustoComposicao(
  itens: { indice: number; insumo: { preco_base: number } }[]
): number {
  return itens.reduce((acc, item) => acc + item.indice * item.insumo.preco_base, 0);
}

export function aplicarBdi(valor: number, bdi: number): number {
  return valor * (1 + bdi / 100);
}

export function calcularCustoItem(
  quantidade: number,
  custoUnitario: number,
  bdiEspecifico: number | null,
  bdiGlobal: number
): { sem_bdi: number; com_bdi: number } {
  const bdi = bdiEspecifico ?? bdiGlobal;
  const sem_bdi = quantidade * custoUnitario;
  const com_bdi = aplicarBdi(sem_bdi, bdi);
  return { sem_bdi, com_bdi };
}

export function calcularTotalOrcamento(
  itens: { custo_total: number; custo_com_bdi: number }[]
): { total_sem_bdi: number; total_com_bdi: number } {
  return itens.reduce(
    (acc, item) => ({
      total_sem_bdi: acc.total_sem_bdi + item.custo_total,
      total_com_bdi: acc.total_com_bdi + item.custo_com_bdi,
    }),
    { total_sem_bdi: 0, total_com_bdi: 0 }
  );
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatNumber(value: number, decimals = 4): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
