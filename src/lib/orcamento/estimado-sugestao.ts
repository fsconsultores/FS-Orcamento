/**
 * Padrão de texto que sugere um serviço/grupo estimado — mesma ideia do
 * antigo sufixo "- Estimado" no nome (removido), agora só como ponto de
 * partida (sugestão visual), nunca a decisão em si. Compartilhado entre a
 * aba Estimados (pré-marca a sugestão, sem salvar) e o Caderno (avisa antes
 * de exportar se sobrou alguma sugestão nunca confirmada — ver
 * report-detail-panel.tsx). Central aqui pra não haver 2 cópias divergentes
 * do mesmo regex, como havia antes.
 */
export const SUGESTAO_ESTIMADO_RE = /-\s*(estimados?|a\s*definir|à\s*definir|aguardando\s+defini[cç][aã]o|pendente\s+defini[cç][aã]o)\b/i

export function pareceEstimado(descricao: string): boolean {
  return SUGESTAO_ESTIMADO_RE.test(descricao)
}
