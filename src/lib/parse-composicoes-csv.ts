export type InsumoRow = {
  codigo: string;
  descricao: string;
  unidade: string;
  indice: number;
};

export type ComposicaoRow = {
  codigo: string;
  descricao: string;
  unidade: string;
  insumos: InsumoRow[];
};

const COLUNAS = {
  CODIGO: 0,
  DESCRICAO: 1,
  UNIDADE: 2,
  INS_CODIGO: 3,
  INS_DESCRICAO: 4,
  INS_UNIDADE: 5,
  INDICE: 6,
} as const;

function splitCsv(line: string, delim: string): string[] {
  return line.split(delim).map((c) => c.replace(/^"|"$/g, '').trim());
}

function toNumber(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

function isHeaderLine(cols: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cols.some((c) => {
    const n = norm(c);
    return n === 'codigo' || n === 'indice' || n === 'unidade';
  });
}

export function parseComposicoesCsv(csvText: string): ComposicaoRow[] {
  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  const delim = lines[0].includes(';') ? ';' : ',';
  const firstCols = splitCsv(lines[0], delim);
  const dataLines = isHeaderLine(firstCols) ? lines.slice(1) : lines;

  const result: ComposicaoRow[] = [];
  let current: ComposicaoRow | null = null;

  for (const line of dataLines) {
    const cols = splitCsv(line, delim);
    const at = (i: number) => cols[i] ?? '';

    const codigo = at(COLUNAS.CODIGO);
    const insCodigo = at(COLUNAS.INS_CODIGO);

    if (!codigo && !insCodigo) continue;

    if (codigo) {
      current = {
        codigo,
        descricao: at(COLUNAS.DESCRICAO),
        unidade: at(COLUNAS.UNIDADE),
        insumos: [],
      };
      result.push(current);
    } else {
      if (!current) continue;

      const indice = toNumber(at(COLUNAS.INDICE));
      current.insumos.push({
        codigo: insCodigo,
        descricao: at(COLUNAS.INS_DESCRICAO),
        unidade: at(COLUNAS.INS_UNIDADE),
        indice: isNaN(indice) ? 0 : indice,
      });
    }
  }

  return result;
}
