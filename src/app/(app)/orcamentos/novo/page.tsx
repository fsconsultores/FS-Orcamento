'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { registrarHistorico } from '@/lib/log';
import { listBases, importarDaBase } from '../[id]/importar/import-action';
import type { BaseInfo } from '../[id]/importar/import-action';

export default function NovoOrcamentoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [form, setForm] = useState({
    nome_obra: '',
    cliente: '',
    data: new Date().toISOString().split('T')[0],
    bdi_global: '25',
    codigo: '0',
  });

  const [bases, setBases] = useState<BaseInfo[]>([]);
  const [basesSelecionadas, setBasesSelecionadas] = useState<Set<string>>(new Set());

  useEffect(() => {
    listBases().then(setBases).catch(() => {});
  }, []);

  function toggleBase(id: string) {
    setBasesSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.nome_obra.trim()) {
      setError('Informe o nome da obra.');
      return;
    }
    const bdi = parseFloat(form.bdi_global);
    if (isNaN(bdi) || bdi < 0) {
      setError('BDI inválido.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data, error: dbError } = await supabase
        .from('tabela_orcamentos')
        .insert({
          user_id: user.id,
          nome_obra: form.nome_obra.trim(),
          cliente: form.cliente.trim() || null,
          data: form.data,
          bdi_global: bdi,
          codigo: form.codigo,
        })
        .select('id')
        .single();

      if (dbError) throw dbError;

      registrarHistorico(supabase, {
        orcamentoId: data.id,
        entidade: 'orcamento',
        tipo: 'sucesso',
        acao: 'criar_orcamento',
        mensagem: `Orçamento "${form.nome_obra.trim()}" criado com sucesso`,
      });

      // Importa as bases selecionadas, uma de cada vez (evita corrida entre
      // duas importações mexendo nas mesmas tabelas do orçamento ao mesmo tempo).
      if (basesSelecionadas.size > 0) {
        for (const baseId of basesSelecionadas) {
          const base = bases.find((b) => b.id === baseId);
          setProgresso(`Importando ${base?.orgao ?? 'base'}...`);
          try {
            const r = await importarDaBase(data.id, baseId, { insumos: true, composicoes: true });
            registrarHistorico(supabase, {
              orcamentoId: data.id,
              entidade: 'base',
              tipo: r.erros.length > 0 ? 'info' : 'sucesso',
              acao: 'importar_da_base',
              mensagem: `Base "${base?.orgao ?? baseId}" importada na criação: ${r.insumosCriados} insumo(s), ${r.composicoesCriadas} composição(ões)`,
              detalhes: { base_id: baseId, ...r },
            }).catch(() => {});
          } catch (err) {
            // Não bloqueia a criação do orçamento por uma base que falhou —
            // o usuário sempre pode importar de novo depois pela aba Importar.
            registrarHistorico(supabase, {
              orcamentoId: data.id,
              entidade: 'base',
              tipo: 'erro',
              acao: 'importar_da_base',
              mensagem: `Falha ao importar base "${base?.orgao ?? baseId}" na criação: ${String(err)}`,
              detalhes: { base_id: baseId },
            }).catch(() => {});
          }
        }
      }

      router.push(`/orcamentos/${data.id}/planilha`);
    } catch {
      setError('Erro ao salvar. Tente novamente.');
      setLoading(false);
      setProgresso(null);
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <Link href="/orcamentos" className="text-sm text-blue-600 hover:underline">
          ← Orçamentos
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Novo orçamento</h1>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <label htmlFor="nome_obra" className="text-sm font-medium text-gray-700">
            Nome da obra *
          </label>
          <input
            id="nome_obra"
            required
            value={form.nome_obra}
            onChange={(e) => update('nome_obra', e.target.value)}
            placeholder="Ex: Residência Unifamiliar - Rua das Flores"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
      
          <label htmlFor="codigo" className="text-sm font-medium text-gray-700">
            Código *
          </label>
          <input
            id="codigo"
            required
            value={form.codigo}
            onChange={(e) => update('codigo', e.target.value)}
            placeholder="Código"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        

        <div className="space-y-1">
          <label htmlFor="cliente" className="text-sm font-medium text-gray-700">
            Cliente
          </label>
          <input
            id="cliente"
            value={form.cliente}
            onChange={(e) => update('cliente', e.target.value)}
            placeholder="Ex: João Silva"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="data" className="text-sm font-medium text-gray-700">
              Data
            </label>
            <input
              id="data"
              type="date"
              value={form.data}
              onChange={(e) => update('data', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="bdi_global" className="text-sm font-medium text-gray-700">
              BDI global (%)
            </label>
            <input
              id="bdi_global"
              type="number"
              min="0"
              step="0.01"
              value={form.bdi_global}
              onChange={(e) => update('bdi_global', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>

        {bases.length > 0 && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
              Bases padrão (opcional)
            </label>
            <p className="text-xs text-gray-400 -mt-1">
              Selecionadas serão importadas automaticamente para este orçamento assim que ele for criado.
              Depois continua dando para importar outras bases normalmente.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {bases.map((b) => {
                const checked = basesSelecionadas.has(b.id);
                return (
                  <label
                    key={b.id}
                    className={`flex items-start gap-3 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${
                      checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleBase(b.id)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <div className="min-w-0">
                      <p className={`text-sm font-medium ${checked ? 'text-blue-700' : 'text-gray-800'}`}>
                        {b.orgao}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {b.total_insumos > 0 && `${b.total_insumos.toLocaleString('pt-BR')} insumos`}
                        {b.total_insumos > 0 && b.total_composicoes > 0 && ' · '}
                        {b.total_composicoes > 0 && `${b.total_composicoes.toLocaleString('pt-BR')} composições`}
                        {b.total_insumos === 0 && b.total_composicoes === 0 && 'Base vazia'}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        {progresso && (
          <p className="text-sm text-blue-600">{progresso}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? (progresso ?? 'Salvando...') : 'Criar orçamento'}
          </button>
          <Link
            href="/orcamentos"
            className="rounded-md border px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
