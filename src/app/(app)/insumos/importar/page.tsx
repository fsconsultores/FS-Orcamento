'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { BASES_ORIGEM, type BaseOrigem } from '@/components/base-filter';

type RowParsed = {
  linha: number;
  codigo: string;
  descricao: string;
  unidade: string;
  preco_base: number;
  grupo: string | null;
  fonte: string | null;
  data_referencia: string | null;
  observacao: string | null;
  erro: string | null;
};

const COL_ALIASES: Record<string, string[]> = {
  codigo:          ['cod', 'codigo', 'código', 'cód', 'code'],
  descricao:       ['descricao', 'descrição', 'descricaocomp', 'descriçãocomp', 'descricaocompleta',
                    'descricaoabreviada', 'description', 'nome', 'name'],
  unidade:         ['unidade', 'und', 'un', 'unit'],
  preco_base:      ['preco_base', 'preco', 'preço', 'custo', 'custounit', 'custounitario',
                    'valor', 'price', 'custo unit', 'r$ unit.', 'r$ unit', 'runit'],
  grupo:           ['grupo', 'grupois', 'grupoinsumo', 'group', 'categoria', 'tipo'],
  fonte:           ['origem', 'fonte', 'base', 'cotacao', 'cotação', 'source'],
  data_referencia: ['data_referencia', 'dataref', 'data ref', 'datareferencia', 'ref'],
  observacao:      ['observacao', 'observação', 'obs', 'nota', 'note'],
};

function normKey(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
}

function detectCols(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((h, i) => {
    const norm = normKey(h);
    for (const [field, aliases] of Object.entries(COL_ALIASES)) {
      if (!(field in map) && aliases.map(normKey).includes(norm)) {
        map[field] = i;
      }
    }
  });
  return map;
}

function parseCsv(text: string): RowParsed[] {
  const cleaned = text.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const delim = lines[0].includes(';') ? ';' : ',';
  const splitLine = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));

  const header = splitLine(lines[0]);
  const cols = detectCols(header);
  const hasHeader = 'codigo' in cols || 'descricao' in cols || 'unidade' in cols;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  const get = (row: string[], field: string) =>
    field in cols ? (row[cols[field]] ?? '').trim() : '';

  return dataLines.map((line, i) => {
    const row = splitLine(line);
    const codigo    = get(row, 'codigo');
    const descricao = get(row, 'descricao');
    const unidade   = get(row, 'unidade');
    const precoStr  = get(row, 'preco_base').replace(/[R$\s]/g, '').replace(',', '.');
    const preco_base = parseFloat(precoStr);
    const grupo     = get(row, 'grupo') || null;
    const fonte     = get(row, 'fonte') || null;
    const dataStr   = get(row, 'data_referencia');
    const observacao = get(row, 'observacao') || null;

    let erro: string | null = null;
    if (!codigo)   erro = 'Código obrigatório';
    else if (!descricao) erro = 'Descrição obrigatória';
    else if (!unidade)   erro = 'Unidade obrigatória';
    else if (isNaN(preco_base) || preco_base < 0) erro = 'Preço inválido';

    let data_referencia: string | null = null;
    if (dataStr) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
        data_referencia = dataStr;
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) {
        const [d, m, y] = dataStr.split('/');
        data_referencia = `${y}-${m}-${d}`;
      } else {
        const n = Number(dataStr);
        if (!isNaN(n) && n > 25569 && n < 73050) {
          const dt = new Date((n - 25569) * 86400000);
          data_referencia = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
        }
      }
    }

    return {
      linha: i + (hasHeader ? 2 : 1),
      codigo,
      descricao,
      unidade,
      preco_base: isNaN(preco_base) ? 0 : preco_base,
      grupo,
      fonte,
      data_referencia,
      observacao,
      erro,
    };
  });
}

export default function ImportarInsumosPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RowParsed[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; erros: number } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [baseOrigem, setBaseOrigem] = useState<BaseOrigem>('PROPRIA');
  const [targetBase, setTargetBase] = useState<{ id: string; orgao: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const baseId = params.get('baseId');
    if (!baseId) return;
    const sb = createClient() as any;
    sb.from('tabela_bases').select('id, orgao').eq('id', baseId).single()
      .then(({ data }: { data: { id: string; orgao: string } | null }) => {
        if (data) setTargetBase(data);
      });
  }, []);

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

  const validas = rows.filter((r) => !r.erro);
  const invalidas = rows.filter((r) => r.erro);

  async function handleImportar() {
    if (validas.length === 0) return;
    setLoading(true);
    setGlobalError(null);

    try {
      const sb = createClient() as any;

      // Usa base da URL se disponível, senão cria/obtém base própria
      let baseId: string;
      if (targetBase) {
        baseId = targetBase.id;
      } else {
        const { data, error: baseErr } = await sb.rpc('get_or_create_propria_base');
        if (baseErr) throw baseErr;
        baseId = data;
      }

      // Insere em lotes de 100
      let ok = 0;
      const errosImport: string[] = [];

      for (let i = 0; i < validas.length; i += 100) {
        const lote = validas.slice(i, i + 100).map((r) => ({
          codigo: r.codigo,
          descricao: r.descricao,
          unidade: r.unidade,
          preco_base: r.preco_base,
          grupo: r.grupo,
          fonte: r.fonte,
          data_referencia: r.data_referencia,
          observacao: r.observacao,
          base_id: baseId,
          base_origem: baseOrigem,
        }));

        const { error: insErr, data } = await sb
          .from('tabela_insumos')
          .insert(lote)
          .select('id');

        if (insErr) {
          errosImport.push(insErr.message);
        } else {
          ok += (data ?? []).length;
        }
      }

      setResultado({ ok, erros: invalidas.length + errosImport.length });
      if (errosImport.length > 0) {
        setGlobalError(`Erros na importação: ${errosImport.join('; ')}`);
      }
      setRows([]);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      setGlobalError((err as { message?: string })?.message ?? 'Erro ao importar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/insumos" className="text-sm text-blue-600 hover:underline">
          ← Insumos
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Importar insumos via CSV</h1>
        <p className="mt-1 text-sm text-gray-500">
          {targetBase
            ? <>Importando para a base <strong className="text-gray-800">{targetBase.orgao}</strong>.</>
            : 'Os insumos serão importados para a sua base própria.'}
        </p>
      </div>

      {targetBase && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
          <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M9 3h6M9 3v4m6-4v4" />
          </svg>
          <p className="text-sm text-blue-800">
            Destino: <strong>{targetBase.orgao}</strong>
          </p>
          <Link href="/bases" className="ml-auto text-xs text-blue-600 hover:underline">← Bases</Link>
        </div>
      )}

      {/* Atalho Cotação */}
      <Link
        href={'/insumos/importar/cotacao' as any}
        className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4 hover:bg-green-100 transition-colors"
      >
        <div className="flex-1">
          <p className="text-sm font-semibold text-green-900">Importar Cotação de Preços (XLSX / CSV)</p>
          <p className="text-xs text-green-700 mt-0.5">
            Atualize preços em massa a partir de uma planilha de cotação. Compara preços atuais × importados, exibe prévia e grava histórico.
          </p>
        </div>
        <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Atalho SINAPI */}
      <Link
        href="/insumos/importar/sinapi"
        className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 hover:bg-blue-100 transition-colors"
      >
        <div className="flex-1">
          <p className="text-sm font-semibold text-blue-900">Importar tabela SINAPI (CSV / XLSX)</p>
          <p className="text-xs text-blue-700 mt-0.5">
            Importa a planilha mensal de preços da CEF (todos os estados). Selecione seu estado, filtre categorias e importe com um clique.
          </p>
        </div>
        <svg className="w-5 h-5 text-blue-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>

      {/* Instruções */}
      <div className="rounded-xl border bg-blue-50 border-blue-100 p-5 space-y-2">
        <h2 className="font-semibold text-blue-900">Formato esperado</h2>
        <p className="text-sm text-blue-800">
          Arquivo CSV com delimitador <strong>vírgula (,)</strong> ou <strong>ponto-e-vírgula (;)</strong>.
          Os nomes das colunas são detectados automaticamente — compatível com formatos variados.
        </p>
        <p className="text-sm text-blue-700 font-mono bg-blue-100 rounded px-3 py-2">
          CÓD;DESCRIÇÃO;UND;PREÇO;GRUPO IS;ORIGEM
        </p>
        <ul className="text-xs text-blue-700 list-disc list-inside space-y-0.5">
          <li><strong>Código</strong> (CÓD, Codigo…), <strong>Descrição</strong>, <strong>Unidade</strong> (UND, Und…) e <strong>Preço</strong> (PREÇO, Custo Unit., CustoUnitario…) — obrigatórios</li>
          <li><strong>Grupo</strong> (GRUPO IS, GrupoInsumo…) e <strong>Origem</strong> (Origem, Cotação, Fonte…) — opcionais</li>
          <li><strong>Data ref.</strong> — opcional, formato dd/mm/aaaa ou aaaa-mm-dd</li>
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
        <p className="text-xs text-gray-400">Origem declarada dos dados — salva em cada registro para filtragem e rastreabilidade.</p>
      </div>

      {/* Upload */}
      <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
        <h2 className="font-semibold text-gray-900">Selecionar arquivo</h2>
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">
                {rows.length} linha{rows.length !== 1 ? 's' : ''} detectada{rows.length !== 1 ? 's' : ''}
                {' · '}
                <span className="text-green-700">{validas.length} válida{validas.length !== 1 ? 's' : ''}</span>
                {invalidas.length > 0 && (
                  <span className="text-red-600"> · {invalidas.length} com erro</span>
                )}
              </p>
            </div>
            <button
              onClick={handleImportar}
              disabled={loading || validas.length === 0}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Importando...' : `Importar ${validas.length} insumo${validas.length !== 1 ? 's' : ''}`}
            </button>
          </div>

          <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-10">#</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-24">Código</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Descrição</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-16">Unid.</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600 w-24">Preço</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-16">Grupo</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-28">Origem</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.linha} className={r.erro ? 'bg-red-50' : 'bg-white'}>
                    <td className="px-3 py-1.5 text-gray-400">{r.linha}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-700">{r.codigo || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-gray-800">{r.descricao || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-gray-600">{r.unidade || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">
                      {r.preco_base > 0
                        ? r.preco_base.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{r.grupo ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5 text-gray-500">{r.fonte ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-1.5">
                      {r.erro ? (
                        <span className="text-red-600 font-medium">{r.erro}</span>
                      ) : (
                        <span className="text-green-600">OK</span>
                      )}
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
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-green-800">
            Importação concluída: {resultado.ok} insumo{resultado.ok !== 1 ? 's' : ''} importado{resultado.ok !== 1 ? 's' : ''}.
          </p>
          {resultado.erros > 0 && (
            <p className="text-sm text-amber-700">{resultado.erros} linha{resultado.erros !== 1 ? 's' : ''} ignorada{resultado.erros !== 1 ? 's' : ''} por erro.</p>
          )}
          <Link href="/insumos" className="text-sm text-green-700 underline">
            Ver insumos →
          </Link>
        </div>
      )}

      {globalError && (
        <p className="text-sm text-red-600">{globalError}</p>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => router.push('/insumos')}
          className="rounded-md border px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
