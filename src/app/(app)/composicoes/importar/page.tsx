'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logAction } from '@/lib/log';
import { BASES_ORIGEM, type BaseOrigem } from '@/components/base-filter';

// ─── Tipos ───────────────────────────────────────────────────────────────────

// Posições fixas das colunas (0-indexed) — formato FS Orcamento:
// 0:Codigo  1:DescricaoAbreviada  2:Unidade  3:ProducaoEquipe  4:OrigemComposicao
// 5:TipoItemComposicao  6:CódigoDoInsumo/...  7:DescricaoAbreviadaInsumo/...
// 8:UnidadeInsumo/...   9:Indice  10:GrupoDoInsumo  11:OrigemInsumosComposicoes

type RowParsed = {
  linha: number;
  comp_codigo: string;
  comp_descricao: string;
  comp_unidade: string;
  tipo_item: string;
  ins_codigo: string;
  ins_descricao: string;
  ins_unidade: string;
  indice: number;
  grupo: string | null;
  status: 'ok' | 'erro' | 'ignorado';
  erro: string | null;
};

type ComposicaoGroup = {
  codigo: string;
  descricao: string;
  unidade: string;
  itens: { ins_codigo: string; ins_descricao: string; ins_unidade: string; indice: number; grupo: string | null }[];
};

type ImportResult = {
  composicoesCriadas: number;
  composicoesSkipped: number;
  insumosCriados: number;
  insumosReutilizados: number;
  itensAdicionados: number;
};

// ─── Parser CSV ───────────────────────────────────────────────────────────────

function parseCsv(text: string): RowParsed[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const delim = lines[0].includes(';') ? ';' : ',';

  // Detecta cabeçalho pela presença de 'Codigo' ou 'Indice' na primeira linha
  const norm0 = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const firstCols = lines[0].split(delim).map(c => norm0(c.replace(/^"|"$/g, '').trim()));
  const isHeader = firstCols.some(c => c === 'codigo' || c === 'indice' || c === 'tipoitemcomposicao');
  const dataLines = isHeader ? lines.slice(1) : lines;

  // Carry-forward: composições com múltiplos insumos repetem apenas os campos do insumo
  let lastComp = { codigo: '', descricao: '', unidade: '' };
  const result: RowParsed[] = [];

  dataLines.forEach((line, i) => {
    const cols = line.split(delim).map(c => c.replace(/^"|"$/g, '').trim());
    const at = (pos: number) => cols[pos] ?? '';

    // Posições fixas conforme o formato real do arquivo
    let comp_codigo    = at(0);
    let comp_descricao = at(1);
    let comp_unidade   = at(2);
    const tipo_item    = at(5);
    const ins_codigo   = at(6);
    const ins_descricao = at(7);
    const ins_unidade  = at(8);
    const indice       = parseFloat(at(9).replace(',', '.'));
    const grupo        = at(10) || null;
    const linhaNum     = i + (isHeader ? 2 : 1);

    // Linhas totalmente vazias → pular silenciosamente
    if (!comp_codigo && !ins_codigo && !tipo_item) return;

    // Tipo 'C' = subcomposição auxiliar → ignorada
    if (tipo_item === 'C') {
      result.push({
        linha: linhaNum,
        comp_codigo: comp_codigo || lastComp.codigo,
        comp_descricao: comp_descricao || lastComp.descricao,
        comp_unidade: comp_unidade || lastComp.unidade,
        tipo_item, ins_codigo, ins_descricao, ins_unidade,
        indice: isNaN(indice) ? 0 : indice, grupo,
        status: 'ignorado', erro: null,
      });
      return;
    }

    // Linhas de continuação: comp_codigo vazio mas ins_codigo preenchido
    // → herda dados da composição anterior
    if (!comp_codigo && ins_codigo) {
      comp_codigo    = lastComp.codigo;
      comp_descricao = lastComp.descricao;
      comp_unidade   = lastComp.unidade;
    } else if (comp_codigo) {
      lastComp = { codigo: comp_codigo, descricao: comp_descricao, unidade: comp_unidade };
    }

    // Sem ins_codigo e sem tipo 'C' → ignorado (outros tipos desconhecidos)
    if (!ins_codigo) {
      result.push({
        linha: linhaNum, comp_codigo, comp_descricao, comp_unidade, tipo_item,
        ins_codigo: '', ins_descricao: '', ins_unidade: '',
        indice: 0, grupo: null, status: 'ignorado', erro: null,
      });
      return;
    }

    let erro: string | null = null;
    if (!comp_codigo)         erro = 'Código da composição ausente';
    else if (!comp_descricao) erro = 'Descrição da composição ausente';
    else if (!comp_unidade)   erro = 'Unidade da composição ausente';
    else if (!ins_descricao)  erro = 'Descrição do insumo ausente';
    else if (!ins_unidade)    erro = 'Unidade do insumo ausente';
    else if (isNaN(indice) || indice < 0) erro = 'Índice inválido (deve ser ≥ 0)';

    result.push({
      linha: linhaNum, comp_codigo, comp_descricao, comp_unidade, tipo_item,
      ins_codigo, ins_descricao, ins_unidade,
      indice: isNaN(indice) ? 0 : indice, grupo,
      status: erro ? 'erro' : 'ok', erro,
    });
  });

  return result;
}

function agrupar(rows: RowParsed[]): ComposicaoGroup[] {
  const map = new Map<string, ComposicaoGroup>();
  for (const row of rows) {
    if (row.status !== 'ok') continue;
    if (!map.has(row.comp_codigo)) {
      map.set(row.comp_codigo, {
        codigo: row.comp_codigo,
        descricao: row.comp_descricao,
        unidade: row.comp_unidade,
        itens: [],
      });
    }
    map.get(row.comp_codigo)!.itens.push({
      ins_codigo: row.ins_codigo,
      ins_descricao: row.ins_descricao,
      ins_unidade: row.ins_unidade,
      indice: row.indice,
      grupo: row.grupo,
    });
  }
  return Array.from(map.values());
}

// ─── Importação em lote ───────────────────────────────────────────────────────

async function importarEmLote(
  grupos: ComposicaoGroup[],
  sb: ReturnType<typeof createClient>,
  baseOrigem: BaseOrigem
): Promise<ImportResult> {
  const sbAny = sb as any;

  // 1. Obter base própria do usuário
  const { data: baseId, error: baseErr } = await sbAny.rpc('get_or_create_propria_base');
  if (baseErr) throw new Error('Não foi possível acessar sua base de dados. Tente novamente.');

  // 2. Construir mapa código → dados do insumo com deduplicação imediata (O(1) lookup)
  //    Garante que o mesmo código, mesmo aparecendo em N composições, seja processado uma única vez.
  const insumosPorCodigo = new Map<string, ComposicaoGroup['itens'][0]>();
  for (const g of grupos) {
    for (const item of g.itens) {
      if (!insumosPorCodigo.has(item.ins_codigo)) {
        insumosPorCodigo.set(item.ins_codigo, item);
      }
    }
  }
  const todosCodigosIns = [...insumosPorCodigo.keys()];

  // 3. Buscar insumos já existentes na base própria em lotes de 500
  //    (evita limite de URL do PostgREST em planilhas grandes)
  const codeToId = new Map<string, string>();
  for (let i = 0; i < todosCodigosIns.length; i += 500) {
    const lote = todosCodigosIns.slice(i, i + 500);
    const { data: existentes, error: existErr } = await sbAny
      .from('tabela_insumos')
      .select('id, codigo')
      .eq('base_id', baseId)
      .in('codigo', lote);
    if (existErr) throw new Error('Erro ao consultar insumos existentes.');
    for (const ins of (existentes ?? []) as { id: string; codigo: string }[]) {
      codeToId.set(ins.codigo, ins.id);
    }
  }
  const insumosReutilizados = codeToId.size;

  // 4. Criar TODOS os insumos ausentes com fonte = 'BASE_PROPRIA'
  //    Após este passo, codeToId terá 100% dos códigos do CSV — sem exceção.
  const codigosAusentes = todosCodigosIns.filter((c) => !codeToId.has(c));
  let insumosCriados = 0;

  for (let i = 0; i < codigosAusentes.length; i += 100) {
    const lote = codigosAusentes.slice(i, i + 100).map((codigo) => {
      const item = insumosPorCodigo.get(codigo)!;
      return {
        codigo,
        descricao: item.ins_descricao,
        unidade: item.ins_unidade,
        preco_base: 0,
        fonte: 'BASE_PROPRIA',
        grupo: item.grupo,
        base_id: baseId,
        base_origem: baseOrigem,
      };
    });

    const { data: novos, error: insErr } = await sbAny
      .from('tabela_insumos')
      .insert(lote)
      .select('id, codigo');
    if (insErr) throw new Error('Erro ao criar insumos automaticamente. Verifique os dados e tente novamente.');

    for (const ins of (novos ?? []) as { id: string; codigo: string }[]) {
      codeToId.set(ins.codigo, ins.id);
      insumosCriados++;
    }
  }

  // Verificação explícita: todos os códigos do CSV devem ter um UUID resolvido.
  // Se qualquer ID estiver faltando, o vínculo seria inválido — abortamos antes de tentar.
  const semId = todosCodigosIns.filter((c) => !codeToId.has(c));
  if (semId.length > 0) {
    throw new Error(
      `Não foi possível obter o ID de ${semId.length} insumo(s) após criação: ${semId.slice(0, 3).join(', ')}${semId.length > 3 ? '...' : ''}. Tente novamente.`
    );
  }

  // 5. Verificar composições já existentes (em lotes de 500)
  const jaExistemSet = new Set<string>();
  const todosCodigosComp = grupos.map((g) => g.codigo);
  for (let i = 0; i < todosCodigosComp.length; i += 500) {
    const lote = todosCodigosComp.slice(i, i + 500);
    const { data: compEx } = await sbAny
      .from('tabela_composicoes')
      .select('codigo')
      .eq('base_id', baseId)
      .in('codigo', lote);
    for (const c of (compEx ?? []) as { codigo: string }[]) {
      jaExistemSet.add(c.codigo);
    }
  }
  const gruposNovos = grupos.filter((g) => !jaExistemSet.has(g.codigo));

  // 6. Inserir composições e itens em lotes de 50
  let composicoesCriadas = 0;
  let itensAdicionados = 0;

  for (let i = 0; i < gruposNovos.length; i += 50) {
    const lote = gruposNovos.slice(i, i + 50);

    const { data: novasComps, error: compErr } = await sbAny
      .from('tabela_composicoes')
      .insert(lote.map((g) => ({ codigo: g.codigo, descricao: g.descricao, unidade: g.unidade, base_id: baseId, base_origem: baseOrigem })))
      .select('id, codigo');
    if (compErr) throw new Error('Erro ao salvar composições. Verifique se há códigos duplicados.');

    const compCodeToId = new Map<string, string>(
      ((novasComps ?? []) as { id: string; codigo: string }[]).map((c) => [c.codigo, c.id])
    );

    // 7. Vincular itens: todos os insumos estão garantidamente em codeToId
    const itens = lote.flatMap((g) => {
      const compId = compCodeToId.get(g.codigo);
      if (!compId) return [];
      return g.itens.map((item) => ({
        composicao_id: compId,
        insumo_id: codeToId.get(item.ins_codigo)!, // sempre presente — invariante do passo 4
        indice: item.indice,
      }));
    });

    if (itens.length > 0) {
      const { error: itensErr } = await sbAny.from('tabela_itens_composicao').insert(itens);
      if (itensErr) throw new Error('Erro ao salvar itens das composições.');
      itensAdicionados += itens.length;
    }

    composicoesCriadas += (novasComps ?? []).length;
  }

  return {
    composicoesCriadas,
    composicoesSkipped: grupos.length - gruposNovos.length,
    insumosCriados,
    insumosReutilizados,
    itensAdicionados,
  };
}

// ─── Componente ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  ok: 'text-green-600',
  erro: 'text-red-600 font-medium',
  ignorado: 'text-gray-400 italic',
};

const STATUS_LABEL: Record<string, string> = {
  ok: 'OK',
  ignorado: 'Ignorado (sub-composição)',
};

export default function ImportarComposicoesPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RowParsed[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ImportResult | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [baseOrigem, setBaseOrigem] = useState<BaseOrigem>('PROPRIA');

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const buffer = ev.target?.result as ArrayBuffer;
      // Tenta UTF-8; se houver caractere de substituição (arquivo Windows-1252), redecodifica
      const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
      const text = utf8.includes('�')
        ? new TextDecoder('windows-1252').decode(buffer)
        : utf8;
      setRows(parseCsv(text));
      setResultado(null);
      setGlobalError(null);
    };
    reader.readAsArrayBuffer(file);
  }

  const validas   = rows.filter((r) => r.status === 'ok');
  const invalidas = rows.filter((r) => r.status === 'erro');
  const ignoradas = rows.filter((r) => r.status === 'ignorado');
  const grupos    = agrupar(validas);
  const insumosUnicos = new Set(validas.map((r) => r.ins_codigo)).size;

  async function handleImportar() {
    if (grupos.length === 0) return;
    setLoading(true);
    setGlobalError(null);

    try {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      const result = await importarEmLote(grupos, sb, baseOrigem);
      setResultado(result);

      await logAction(sb, {
        usuario: user?.email ?? '',
        tipo: 'sucesso',
        acao: 'importar_composicoes',
        mensagem: `${result.composicoesCriadas} composição(ões) importada(s) com sucesso. ${result.insumosCriados} insumo(s) criado(s) automaticamente.`,
        contexto: result as unknown as Record<string, unknown>,
      });

      setRows([]);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message ?? 'Erro ao importar. Tente novamente.';
      setGlobalError(msg);
      try {
        const sb = createClient();
        const { data: { user } } = await sb.auth.getUser();
        await logAction(sb, {
          usuario: user?.email ?? '',
          tipo: 'erro',
          acao: 'importar_composicoes',
          mensagem: `Erro na importação: ${msg}`,
        });
      } catch { /* silencioso */ }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link href="/composicoes" className="text-sm text-blue-600 hover:underline">
          ← Composições
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Importar composições via CSV</h1>
        <p className="mt-1 text-sm text-gray-500">
          Insumos ausentes são criados automaticamente com preço 0. Composições auxiliares (sub-composições) são ignoradas.
        </p>
      </div>

      {/* Formato */}
      <div className="rounded-xl border bg-blue-50 border-blue-100 p-5 space-y-3">
        <h2 className="font-semibold text-blue-900">Formato esperado</h2>
        <p className="text-sm text-blue-800">
          CSV com delimitador <strong>vírgula (,)</strong> ou <strong>ponto-e-vírgula (;)</strong>.
          Cada linha = um insumo de uma composição. Linhas sem <code className="bg-blue-100 px-1 rounded text-xs">CodigoInsumo</code> são ignoradas automaticamente.
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs text-blue-800 border-collapse">
            <thead>
              <tr className="bg-blue-100">
                {['#', 'codigo', 'descricao', 'unidade', 'producaoEquipe', 'origemComposicao', 'tipoItemComposicao', 'CodigoInsumo', 'DescricaoAbreviada...', 'Unidade', 'indice', 'grupodoInsumo', 'Origem Insumo'].map((h) => (
                  <th key={h} className="px-2 py-1 border border-blue-200 font-mono font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'].map((n) => (
                  <td key={n} className="px-2 py-1 border border-blue-200 text-center text-blue-500">{n}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <ul className="text-xs text-blue-700 list-disc list-inside space-y-0.5">
          <li>Arquivo pode ter ou não linha de cabeçalho — detectado automaticamente</li>
          <li>Insumos já existentes na sua base são reutilizados; ausentes são criados com <strong>fonte = BASE_PROPRIA</strong> e preço = 0</li>
          <li>Atualize os preços dos insumos criados em <Link href="/insumos" className="underline">Insumos</Link></li>
          <li>Composições com código já existente são ignoradas (não sobreescreve)</li>
        </ul>
      </div>

      {/* Base de origem */}
      <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
        <h2 className="font-semibold text-gray-900">Base de origem <span className="text-red-500">*</span></h2>
        <div className="flex flex-wrap gap-2">
          {BASES_ORIGEM.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBaseOrigem(b)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                baseOrigem === b
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">Origem declarada dos dados — salva em composições e insumos criados automaticamente.</p>
      </div>

      {/* Upload */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 font-semibold text-gray-900">Selecionar arquivo</h2>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFile}
          className="block text-sm text-gray-700 file:mr-3 file:py-1.5 file:px-4 file:rounded-md file:border file:border-gray-300 file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50 cursor-pointer"
        />
      </div>

      {/* Preview */}
      {rows.length > 0 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-gray-700">
                {rows.length} linha{rows.length !== 1 ? 's' : ''} lida{rows.length !== 1 ? 's' : ''}
                {' · '}
                <span className="text-green-700">{validas.length} válida{validas.length !== 1 ? 's' : ''}</span>
                {invalidas.length > 0 && <span className="text-red-600"> · {invalidas.length} com erro</span>}
                {ignoradas.length > 0 && <span className="text-gray-400"> · {ignoradas.length} ignorada{ignoradas.length !== 1 ? 's' : ''}</span>}
              </p>
              {validas.length > 0 && (
                <p className="text-xs text-gray-500">
                  {grupos.length} composição{grupos.length !== 1 ? 'ões' : ''} única{grupos.length !== 1 ? 's' : ''}
                  {' · '}
                  {insumosUnicos} insumo{insumosUnicos !== 1 ? 's' : ''} único{insumosUnicos !== 1 ? 's' : ''}
                </p>
              )}
            </div>
            <button
              onClick={handleImportar}
              disabled={loading || grupos.length === 0}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Importando...' : `Importar ${grupos.length} composição${grupos.length !== 1 ? 'ões' : ''}`}
            </button>
          </div>

          <div className="overflow-auto rounded-xl border bg-white shadow-sm max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="border-b bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 w-8">#</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Cód. Composição</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Descrição Composição</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-12">Und.</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-10">Tipo</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Cód. Insumo</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Descrição Insumo</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-12">Und.</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 w-16">Índice</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-20">Grupo</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-32">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr
                    key={r.linha}
                    className={
                      r.status === 'erro' ? 'bg-red-50' :
                      r.status === 'ignorado' ? 'bg-gray-50' : 'bg-white'
                    }
                  >
                    <td className="px-3 py-1.5 text-gray-400">{r.linha}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-700">{r.comp_codigo || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-gray-800 max-w-[140px] truncate">{r.comp_descricao || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.comp_unidade || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-gray-400 font-mono">{r.tipo_item || '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-700">{r.ins_codigo || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-gray-800 max-w-[140px] truncate">{r.ins_descricao || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.ins_unidade || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">
                      {r.indice > 0 ? r.indice.toLocaleString('pt-BR', { maximumFractionDigits: 6 }) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{r.grupo || <span className="text-gray-300">—</span>}</td>
                    <td className={`px-3 py-1.5 ${STATUS_STYLE[r.status]}`}>
                      {r.status === 'erro' ? r.erro : (STATUS_LABEL[r.status] ?? r.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4 space-y-1.5">
          <p className="text-sm font-semibold text-green-800">Importação concluída!</p>
          <ul className="text-sm text-green-700 space-y-0.5">
            <li>✔ {resultado.composicoesCriadas} composição{resultado.composicoesCriadas !== 1 ? 'ões' : ''} criada{resultado.composicoesCriadas !== 1 ? 's' : ''}</li>
            <li>✔ {resultado.itensAdicionados} vínculo{resultado.itensAdicionados !== 1 ? 's' : ''} composição-insumo registrado{resultado.itensAdicionados !== 1 ? 's' : ''}</li>
            <li>✔ {resultado.insumosCriados} insumo{resultado.insumosCriados !== 1 ? 's' : ''} criado{resultado.insumosCriados !== 1 ? 's' : ''} automaticamente (preço = 0, fonte = BASE_PROPRIA)</li>
            <li className="text-green-600">↩ {resultado.insumosReutilizados} insumo{resultado.insumosReutilizados !== 1 ? 's' : ''} já existia{resultado.insumosReutilizados !== 1 ? 'm' : ''} e {resultado.insumosReutilizados !== 1 ? 'foram reutilizados' : 'foi reutilizado'}</li>
            {resultado.composicoesSkipped > 0 && (
              <li className="text-amber-700">⚠ {resultado.composicoesSkipped} composição{resultado.composicoesSkipped !== 1 ? 'ões' : ''} já existia{resultado.composicoesSkipped !== 1 ? 'm' : ''} — ignorada{resultado.composicoesSkipped !== 1 ? 's' : ''}</li>
            )}
          </ul>
          {resultado.insumosCriados > 0 && (
            <p className="text-xs text-amber-700 mt-1">
              Atualize o preço dos insumos criados em{' '}
              <Link href="/insumos" className="underline">Insumos →</Link>
            </p>
          )}
          <Link href="/composicoes" className="mt-1 inline-block text-sm text-green-700 underline">
            Ver composições →
          </Link>
        </div>
      )}

      {globalError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {globalError}
        </p>
      )}

      <div>
        <button
          onClick={() => router.push('/composicoes')}
          className="rounded-md border px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
