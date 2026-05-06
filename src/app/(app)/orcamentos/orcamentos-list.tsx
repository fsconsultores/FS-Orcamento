'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition, useState } from 'react';
import { duplicateOrcamento, deleteOrcamento } from './actions';
import type { DuplicateResult } from './actions';

type OrcRow = {
  id: string;
  nome_obra: string;
  cliente: string | null;
  data: string;
  bdi_global: number;
  codigo: string;
  tabela_itens_orcamento: { id: string }[];
  ultimo_acesso: string | null;
};

interface Props {
  initialOrcamentos: OrcRow[];
  totaisMap: Record<string, number>;
}

interface ConfirmState {
  id: string;
  nome: string;
}

function resultToRow(r: DuplicateResult, itemCount: number): OrcRow {
  return {
    id: r.id,
    nome_obra: r.nome_obra,
    cliente: r.cliente,
    data: r.data,
    bdi_global: r.bdi_global,
    codigo: r.codigo ?? '',
    tabela_itens_orcamento: Array.from({ length: itemCount }, (_, i) => ({ id: String(i) })),
    ultimo_acesso: r.ultimo_acesso,
  };
}

export function OrcamentosGrid({ initialOrcamentos }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [orcamentos, setOrcamentos] = useState<OrcRow[]>(initialOrcamentos);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);

  async function handleDuplicate(e: React.MouseEvent, orc: OrcRow) {
    e.preventDefault();
    e.stopPropagation();
    setDuplicating(orc.id);
    try {
      const result = await duplicateOrcamento(orc.id);
      // Insere a cópia imediatamente no topo da lista (atualização otimista)
      setOrcamentos(prev => [resultToRow(result, orc.tabela_itens_orcamento.length), ...prev]);
    } catch (err: unknown) {
      alert(`Erro ao duplicar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDuplicating(null);
    }
  }

  function handleDeleteClick(e: React.MouseEvent, orc: OrcRow) {
    e.preventDefault();
    e.stopPropagation();
    setConfirm({ id: orc.id, nome: orc.nome_obra });
  }

  async function confirmDelete() {
    if (!confirm) return;
    const idToDelete = confirm.id;
    setDeleting(idToDelete);
    setConfirm(null);
    // Remove otimisticamente da lista
    setOrcamentos(prev => prev.filter(o => o.id !== idToDelete));
    try {
      await deleteOrcamento(idToDelete);
    } catch (err: unknown) {
      // Reverte se falhou
      startTransition(() => router.refresh());
      alert(`Erro ao excluir: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(null);
    }
  }

  if (orcamentos.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
        <p className="text-gray-400">Nenhum orçamento criado.</p>
        <Link href="/orcamentos/novo" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          Criar primeiro orçamento →
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Modal de confirmação de exclusão */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Excluir orçamento</h2>
            <p className="mt-2 text-sm text-gray-600">
              Tem certeza que deseja excluir{' '}
              <span className="font-medium text-gray-900">"{confirm.nome}"</span>?
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Esta ação é irreversível. Todos os itens, insumos e composições serão removidos.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirm(null)}
                className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nome da Obra</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3 text-center">BDI</th>
              <th className="px-4 py-3 text-center">Itens</th>
              <th className="px-4 py-3">Último Acesso</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {orcamentos.map((orc) => {
              const isDeleting = deleting === orc.id;
              return (
                <tr
                  key={orc.id}
                  className={`cursor-pointer hover:bg-blue-50 hover:shadow-[inset_3px_0_0_0_#3b82f6] transition-all ${isDeleting ? 'opacity-40' : ''}`}
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    <Link href={`/orcamentos/${orc.id}`} className="block w-full h-full">
                      {orc.codigo}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    <Link href={`/orcamentos/${orc.id}`} className="block w-full h-full">
                      {orc.nome_obra}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <Link href={`/orcamentos/${orc.id}`} className="block w-full h-full">
                      {orc.cliente ?? '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    <Link href={`/orcamentos/${orc.id}`} className="block w-full h-full">
                      {orc.bdi_global}%
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    <Link href={`/orcamentos/${orc.id}`} className="block w-full h-full">
                      {orc.tabela_itens_orcamento.length}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <Link href={`/orcamentos/${orc.id}`} className="block w-full h-full">
                      {orc.ultimo_acesso
                        ? new Date(orc.ultimo_acesso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={(e) => handleDuplicate(e, orc)}
                        disabled={duplicating === orc.id || isDeleting}
                        title="Duplicar orçamento"
                        className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                      >
                        {duplicating === orc.id ? '…' : 'Duplicar'}
                      </button>
                      <button
                        onClick={(e) => handleDeleteClick(e, orc)}
                        disabled={isDeleting}
                        title="Excluir orçamento"
                        className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                      >
                        {isDeleting ? '…' : 'Excluir'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
