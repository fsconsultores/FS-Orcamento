'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type RowParsed = {
  linha: number;
  codigo: string;
  descricao: string;
  unidade: string;
  preco_base: number;
  data_referencia: string | null;
  observacao: string | null;
  erro: string | null;
};

const COLUNAS = ['codigo', 'descricao', 'unidade', 'preco_base', 'data_referencia', 'observacao'];

function parseCsv(text: string): RowParsed[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  // Detectar delimitador (vírgula ou ponto-e-vírgula)
  const delim = lines[0].includes(';') ? ';' : ',';

  // Verificar se a primeira linha é cabeçalho
  const header = lines[0].toLowerCase().split(delim).map((h) => h.trim().replace(/^"|"$/g, ''));
  const isHeader = header.some((h) => COLUNAS.includes(h));
  const dataLines = isHeader ? lines.slice(1) : lines;

  const indexOf = (col: string) => {
    const idx = header.indexOf(col);
    return isHeader && idx >= 0 ? idx : COLUNAS.indexOf(col);
  };

  return dataLines.map((line, i) => {
    const cols = line.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
    const get = (col: string) => cols[indexOf(col)] ?? '';

    const codigo = get('codigo');
    const descricao = get('descricao');
    const unidade = get('unidade');
    const precoStr = get('preco_base').replace(',', '.');
    const preco_base = parseFloat(precoStr);
    const dataStr = get('data_referencia');
    const observacao = get('observacao') || null;

    let erro: string | null = null;
    if (!codigo) erro = 'Código obrigatório';
    else if (!descricao) erro = 'Descrição obrigatória';
    else if (!unidade) erro = 'Unidade obrigatória';
    else if (isNaN(preco_base) || preco_base < 0) erro = 'Preço inválido';

    let data_referencia: string | null = null;
    if (dataStr) {
      // Aceita dd/mm/yyyy ou yyyy-mm-dd
      if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
        data_referencia = dataStr;
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataStr)) {
        const [d, m, y] = dataStr.split('/');
        data_referencia = `${y}-${m}-${d}`;
      }
    }

    return {
      linha: i + (isHeader ? 2 : 1),
      codigo,
      descricao,
      unidade,
      preco_base: isNaN(preco_base) ? 0 : preco_base,
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

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRows(parseCsv(text));
      setResultado(null);
      setGlobalError(null);
    };
    reader.readAsText(file, 'UTF-8');
  }

  const validas = rows.filter((r) => !r.erro);
  const invalidas = rows.filter((r) => r.erro);

  async function handleImportar() {
    if (validas.length === 0) return;
    setLoading(true);
    setGlobalError(null);

    try {
      const sb = createClient() as any;

      // Obtém ou cria base própria
      const { data: baseId, error: baseErr } = await sb.rpc('get_or_create_propria_base');
      if (baseErr) throw baseErr;

      // Insere em lotes de 100
      let ok = 0;
      const errosImport: string[] = [];

      for (let i = 0; i < validas.length; i += 100) {
        const lote = validas.slice(i, i + 100).map((r) => ({
          codigo: r.codigo,
          descricao: r.descricao,
          unidade: r.unidade,
          preco_base: r.preco_base,
          data_referencia: r.data_referencia,
          observacao: r.observacao,
          base_id: baseId,
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
          Os insumos serão importados para a sua base própria.
        </p>
      </div>

      {/* Instruções */}
      <div className="rounded-xl border bg-blue-50 border-blue-100 p-5 space-y-2">
        <h2 className="font-semibold text-blue-900">Formato esperado</h2>
        <p className="text-sm text-blue-800">
          Arquivo CSV com delimitador <strong>vírgula (,)</strong> ou <strong>ponto-e-vírgula (;)</strong>.
          Primeira linha pode ser cabeçalho ou dados diretos.
        </p>
        <p className="text-sm text-blue-700 font-mono bg-blue-100 rounded px-3 py-2">
          codigo;descricao;unidade;preco_base;data_referencia;observacao
        </p>
        <ul className="text-xs text-blue-700 list-disc list-inside space-y-0.5">
          <li><strong>codigo</strong>, <strong>descricao</strong>, <strong>unidade</strong> e <strong>preco_base</strong> — obrigatórios</li>
          <li><strong>data_referencia</strong> — opcional, formato dd/mm/aaaa ou aaaa-mm-dd</li>
          <li><strong>observacao</strong> — opcional</li>
        </ul>
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
                  <th className="px-3 py-2 text-left font-medium text-gray-600 w-24">Data ref.</th>
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
                    <td className="px-3 py-1.5 text-gray-500">
                      {r.data_referencia
                        ? new Date(r.data_referencia).toLocaleDateString('pt-BR')
                        : <span className="text-gray-300">—</span>}
                    </td>
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
