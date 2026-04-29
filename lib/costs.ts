import type { ItemComposicao, Insumo, ItemOrcamento, Orcamento } from './supabase/types';

export function calcularCustoComposicao(
  itens: (ItemComposicao & { insumo: Pick<Insumo, 'preco_base'> })[]
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
