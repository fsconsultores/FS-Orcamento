// ─── Types ───────────────────────────────────────────────────────────────────

export type NivelItem = 'grupo' | 'composicao' | 'insumo';

export type RawGridItem = {
  codigo?: string;
  composicaoCodigo?: string; // código da composição para a coluna "Composição" (ex: CZ200002)
  descricao: string;
  unidade?: string;
  quantidade?: number | string;
  custoUnitario?: number | string;
  bdi?: number | string;
  nivel?: NivelItem;
};

export type InsumoNode = {
  tipo: 'insumo';
  item: string;       // ex: 001.001.001
  composicao?: string;
  descricao: string;
  unidade?: string;
  quantidade: number;
  custoUnitario: number;
  total: number;
  bdi: number;
};

export type ComposicaoNode = {
  tipo: 'composicao';
  item: string;       // ex: 001.001
  composicao?: string;
  descricao: string;
  unidade?: string;
  quantidade: number;
  custoUnitario: number;
  total: number;
  bdi: number;
  insumos: InsumoNode[];
};

export type GrupoNode = {
  tipo: 'grupo';
  item: string;       // ex: 001
  descricao: string;
  total: number;      // soma dos totais das composições filhas
  filhos: ComposicaoNode[];
};

// Union para uso em componentes que renderizam qualquer nó
export type OrcamentoNode = GrupoNode | ComposicaoNode | InsumoNode;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Converte string ou número para number.
 * Suporta formato BR com separador de milhar: "1.500,50" → 1500.50
 * Suporta decimal com vírgula: "4,5" → 4.5
 * Retorna 0 para valores ausentes ou inválidos.
 */
export function parseNumero(value: number | string | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;

  const s = String(value).trim();
  if (!s) return 0;

  if (s.includes(',')) {
    // Formato BR: ponto = milhar, vírgula = decimal → "1.500,50" → 1500.50
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }

  // Sem vírgula: verifica se ponto é separador de milhar (exatamente 3 dígitos após)
  // "1.500" → 1500 | "1.50" → 1.50 | "1.5" → 1.5
  const lastDot = s.lastIndexOf('.');
  if (lastDot !== -1 && s.length - lastDot - 1 === 3 && !s.slice(0, lastDot).includes('.')) {
    return parseFloat(s.replace('.', '')) || 0;
  }

  return parseFloat(s) || 0;
}

/**
 * Infere nível pela contagem de segmentos do código hierárquico.
 * "001" → grupo | "001.001" → composição | undefined/vazio → insumo
 *
 * ATENÇÃO: só usar quando `nivel` não está definido e o código segue o padrão
 * hierárquico (001, 001.001). Códigos de catálogo (CZ200002) exigem `nivel` explícito.
 */
export function inferirNivel(codigo: string | undefined): NivelItem {
  const s = codigo?.trim();
  if (!s) return 'insumo';
  return s.split('.').filter(Boolean).length === 1 ? 'grupo' : 'composicao';
}

function norm(s: string | undefined): string | undefined {
  return s?.trim() || undefined;
}

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

// ─── Transformação principal ──────────────────────────────────────────────────

export function transformToOrcamentoGrid(items: RawGridItem[]): GrupoNode[] {
  const result: GrupoNode[] = [];
  let grupoAtual: GrupoNode | null = null;
  let composicaoAtual: ComposicaoNode | null = null;
  let grupoIdx = 0;
  let compIdx = 0;
  let insumoIdx = 0;

  for (const raw of items) {
    const descricao = raw.descricao?.trim();
    if (!descricao && !raw.codigo?.trim() && !raw.composicaoCodigo?.trim()) continue;

    const nivel = raw.nivel ?? inferirNivel(raw.codigo);
    const quantidade = parseNumero(raw.quantidade);
    const custoUnitario = parseNumero(raw.custoUnitario);
    const bdi = parseNumero(raw.bdi);
    const total = quantidade * custoUnitario;

    if (nivel === 'grupo') {
      grupoIdx++;
      compIdx = 0;
      grupoAtual = {
        tipo: 'grupo',
        item: pad(grupoIdx),
        descricao: descricao ?? '',
        total: 0,
        filhos: [],
      };
      composicaoAtual = null;
      result.push(grupoAtual);
      continue;
    }

    if (nivel === 'composicao') {
      if (!grupoAtual) continue;
      compIdx++;
      insumoIdx = 0;
      composicaoAtual = {
        tipo: 'composicao',
        item: `${grupoAtual.item}.${pad(compIdx)}`,
        composicao: norm(raw.composicaoCodigo),
        descricao: descricao ?? '',
        unidade: norm(raw.unidade),
        quantidade,
        custoUnitario,
        total,
        bdi,
        insumos: [],
      };
      grupoAtual.filhos.push(composicaoAtual);
      grupoAtual.total += total; // acumula total do grupo em O(1), sem segundo passo
      continue;
    }

    // insumo
    if (!composicaoAtual) continue;
    insumoIdx++;
    composicaoAtual.insumos.push({
      tipo: 'insumo',
      item: `${composicaoAtual.item}.${pad(insumoIdx)}`,
      composicao: norm(raw.composicaoCodigo),
      descricao: descricao ?? '',
      unidade: norm(raw.unidade),
      quantidade,
      custoUnitario,
      total,
      bdi,
    });
  }

  return result;
}

// ─── Utilitário de renderização ───────────────────────────────────────────────

/**
 * Achata a árvore em lista ordenada com profundidade, pronto para renderizar
 * em uma tabela React com expand/collapse por índice.
 *
 * gruposExpandidos / composicoesExpandidas: Set de `item` codes visíveis.
 * Omitir = tudo expandido.
 */
export function flattenOrcamentoGrid(
  grupos: GrupoNode[],
  gruposExpandidos?: Set<string>,
  composicoesExpandidas?: Set<string>,
): { node: OrcamentoNode; depth: number }[] {
  const rows: { node: OrcamentoNode; depth: number }[] = [];

  for (const grupo of grupos) {
    rows.push({ node: grupo, depth: 0 });

    const grupoAberto = !gruposExpandidos || gruposExpandidos.has(grupo.item);
    if (!grupoAberto) continue;

    for (const comp of grupo.filhos) {
      rows.push({ node: comp, depth: 1 });

      const compAberta = !composicoesExpandidas || composicoesExpandidas.has(comp.item);
      if (!compAberta) continue;

      for (const ins of comp.insumos) {
        rows.push({ node: ins, depth: 2 });
      }
    }
  }

  return rows;
}
