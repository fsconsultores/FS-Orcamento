'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { BASES_ORIGEM, type BaseOrigem } from '@/components/base-filter';
import { PageHeader } from '@/components/ui/toolbar';
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ImportResultBox } from '@/components/import-result-box';
import { WizardSteps } from '@/components/ui/import-wizard';

const STEPS = [
  { key: 'arquivo', label: 'Arquivo' },
  { key: 'preview', label: 'Prévia e validação' },
  { key: 'resultado', label: 'Resultado' },
];

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
  const step = resultado ? 'resultado' : rows.length > 0 ? 'preview' : 'arquivo';

  function resetArquivo() {
    setRows([]);
    setGlobalError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

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
      setGlobalError((err as { message?: string })?.message ?? 'Não foi possível importar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/insumos" className="text-sm text-primary-700 hover:underline">
          ← Insumos
        </Link>
        <div className="mt-2">
          <PageHeader
            title="Importar insumos via CSV"
            description={targetBase
              ? <>Importando para a base <strong className="text-gray-800">{targetBase.orgao}</strong>.</>
              : 'Os insumos serão importados para a sua base própria.'}
          />
        </div>
      </div>

      <WizardSteps steps={STEPS} currentKey={step} />

      {targetBase && (
        <div className="flex items-center gap-3 rounded-lg border border-secondary-200 bg-secondary-50 px-4 py-3">
          <Building2 size={16} className="text-secondary-500 shrink-0" />
          <p className="text-sm text-secondary-800">
            Destino: <strong>{targetBase.orgao}</strong>
          </p>
          <Link href="/bases" className="ml-auto text-xs text-secondary-700 hover:underline">← Bases</Link>
        </div>
      )}

      {step === 'arquivo' && (
        <>
          {/* Atalho Cotação */}
          <Link
            href={'/insumos/importar/cotacao' as any}
            className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 hover:bg-emerald-100 transition-colors"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-900">Importar Cotação de Preços (XLSX / CSV)</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Atualize preços em massa a partir de uma planilha de cotação. Compara preços atuais × importados, exibe prévia e grava histórico.
              </p>
            </div>
            <ArrowRight size={18} className="text-emerald-500 shrink-0" />
          </Link>

          {/* Atalho SINAPI */}
          <Link
            href="/insumos/importar/sinapi"
            className="flex items-center gap-3 rounded-xl border border-secondary-200 bg-secondary-50 p-4 hover:bg-secondary-100 transition-colors"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-secondary-900">Importar tabela SINAPI (CSV / XLSX)</p>
              <p className="text-xs text-secondary-700 mt-0.5">
                Importa a planilha mensal de preços da CEF (todos os estados). Selecione seu estado, filtre categorias e importe com um clique.
              </p>
            </div>
            <ArrowRight size={18} className="text-secondary-500 shrink-0" />
          </Link>

          {/* Instruções */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-2">
            <h2 className="font-semibold text-gray-900">Formato esperado</h2>
            <p className="text-sm text-gray-600">
              Arquivo CSV com delimitador <strong>vírgula (,)</strong> ou <strong>ponto-e-vírgula (;)</strong>.
              Os nomes das colunas são detectados automaticamente — compatível com formatos variados.
            </p>
            <p className="text-sm text-gray-700 font-mono bg-gray-100 rounded px-3 py-2">
              CÓD;DESCRIÇÃO;UND;PREÇO;GRUPO IS;ORIGEM
            </p>
            <ul className="text-xs text-gray-500 list-disc list-inside space-y-0.5">
              <li><strong>Código</strong> (CÓD, Codigo…), <strong>Descrição</strong>, <strong>Unidade</strong> (UND, Und…) e <strong>Preço</strong> (PREÇO, Custo Unit., CustoUnitario…) — obrigatórios</li>
              <li><strong>Grupo</strong> (GRUPO IS, GrupoInsumo…) e <strong>Origem</strong> (Origem, Cotação, Fonte…) — opcionais</li>
              <li><strong>Data ref.</strong> — opcional, formato dd/mm/aaaa ou aaaa-mm-dd</li>
            </ul>
          </div>

          {/* Base de origem */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-3">
            <h2 className="font-semibold text-gray-900">Base de origem <span className="text-red-500">*</span></h2>
            <div className="flex flex-wrap gap-2">
              {BASES_ORIGEM.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBaseOrigem(b)}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    baseOrigem === b
                      ? 'bg-primary-700 text-white border-primary-700'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400 hover:text-primary-700'
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
        </>
      )}

      {/* Preview */}
      {step === 'preview' && (
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
              <button onClick={resetArquivo} className="mt-0.5 text-xs font-medium text-primary-700 hover:underline">
                ← Trocar arquivo
              </button>
            </div>
            <Button onClick={handleImportar} disabled={validas.length === 0} loading={loading}>
              Importar {validas.length} insumo{validas.length !== 1 ? 's' : ''}
            </Button>
          </div>

          <Table>
            <Thead>
              <Th className="w-10">#</Th>
              <Th className="w-24">Código</Th>
              <Th>Descrição</Th>
              <Th className="w-16">Unid.</Th>
              <Th className="w-24 text-right">Preço</Th>
              <Th className="w-16">Grupo</Th>
              <Th className="w-28">Origem</Th>
              <Th>Status</Th>
            </Thead>
            <Tbody>
              {rows.map((r) => (
                <Tr key={r.linha} className={r.erro ? 'bg-red-50' : ''}>
                  <Td className="text-xs text-gray-400">{r.linha}</Td>
                  <Td className="text-xs font-mono text-gray-700">{r.codigo || <span className="text-gray-300">—</span>}</Td>
                  <Td className="text-xs text-gray-800">{r.descricao || <span className="text-gray-300">—</span>}</Td>
                  <Td className="text-xs text-gray-600">{r.unidade || <span className="text-gray-300">—</span>}</Td>
                  <Td className="text-xs text-right text-gray-700">
                    {r.preco_base > 0
                      ? r.preco_base.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                      : <span className="text-gray-300">—</span>}
                  </Td>
                  <Td className="text-xs text-gray-500">{r.grupo ?? <span className="text-gray-300">—</span>}</Td>
                  <Td className="text-xs text-gray-500">{r.fonte ?? <span className="text-gray-300">—</span>}</Td>
                  <Td className="text-xs">
                    {r.erro ? (
                      <span className="text-red-600 font-medium">{r.erro}</span>
                    ) : (
                      <span className="text-emerald-600">OK</span>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <ImportResultBox variant={resultado.erros > 0 ? 'warning' : 'success'} title={`Importação concluída: ${resultado.ok} insumo${resultado.ok !== 1 ? 's' : ''} importado${resultado.ok !== 1 ? 's' : ''}.`}>
          {resultado.erros > 0 && <p>{resultado.erros} linha{resultado.erros !== 1 ? 's' : ''} ignorada{resultado.erros !== 1 ? 's' : ''} por erro.</p>}
          <Link href="/insumos" className="font-medium text-primary-700 hover:underline">
            Ver insumos →
          </Link>
        </ImportResultBox>
      )}

      {globalError && (
        <p className="text-sm text-red-600">{globalError}</p>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.push('/insumos')}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
