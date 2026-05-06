// ─── Types ───────────────────────────────────────────────────────────────────

export type NivelItem = 'grupo' | 'composicao' | 'insumo';

export type RawItem = {
  codigo?: string;
  descricao: string;
  unidade?: string;
  quantidade?: number | string;
  custoUnitario?: number | string;
  nivel?: NivelItem;
};

export type Insumo = {
  tipo: 'insumo';
  codigo?: string;
  descricao: string;
  unidade?: string;
  quantidade?: number;
};

export type Composicao = {
  tipo: 'composicao';
  codigo?: string;
  descricao: string;
  unidade?: string;
  quantidade?: number;
  custoUnitario?: number;
  insumos: Insumo[];
};

export type Grupo = {
  tipo: 'grupo';
  codigo?: string;
  descricao: string;
  filhos: Composicao[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function parseNumero(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return isNaN(value) ? undefined : value;
  const n = parseFloat(String(value).replace(',', '.'));
  return isNaN(n) ? undefined : n;
}

export function inferirNivel(codigo: string | undefined): NivelItem {
  const trimmed = codigo?.trim();
  if (!trimmed) return 'insumo';
  return trimmed.split('.').filter(Boolean).length === 1 ? 'grupo' : 'composicao';
}

function norm(s: string | undefined): string | undefined {
  return s?.trim() || undefined;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function transformToOrcamentoTree(items: RawItem[]): Grupo[] {
  const result: Grupo[] = [];
  let grupoAtual: Grupo | null = null;
  let composicaoAtual: Composicao | null = null;

  for (const raw of items) {
    const descricao = raw.descricao?.trim();
    if (!descricao && !raw.codigo?.trim()) continue;

    const nivel = raw.nivel ?? inferirNivel(raw.codigo);

    if (nivel === 'grupo') {
      grupoAtual = { tipo: 'grupo', codigo: norm(raw.codigo), descricao: descricao ?? '', filhos: [] };
      composicaoAtual = null;
      result.push(grupoAtual);
      continue;
    }

    if (nivel === 'composicao') {
      if (!grupoAtual) continue;
      composicaoAtual = {
        tipo: 'composicao',
        codigo: norm(raw.codigo),
        descricao: descricao ?? '',
        unidade: norm(raw.unidade),
        quantidade: parseNumero(raw.quantidade),
        custoUnitario: parseNumero(raw.custoUnitario),
        insumos: [],
      };
      grupoAtual.filhos.push(composicaoAtual);
      continue;
    }

    // insumo
    if (!composicaoAtual) continue;
    composicaoAtual.insumos.push({
      tipo: 'insumo',
      codigo: norm(raw.codigo),
      descricao: descricao ?? '',
      unidade: norm(raw.unidade),
      quantidade: parseNumero(raw.quantidade),
    });
  }

  return result;
}
