'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
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

interface DuplicateModal {
  orc: OrcRow;
  codigo: string;
  error?: string;
}

interface NovoModal {
  nome_obra: string;
  codigo: string;
  cliente: string;
  data: string;
  bdi_global: string;
  error?: string;
}

interface EditModal {
  id: string;
  nome_obra: string;
  codigo: string;
  cliente: string;
  data: string;
  bdi_global: string;
  error?: string;
}

const NOVO_DEFAULT: NovoModal = {
  nome_obra: '',
  codigo: '',
  cliente: '',
  data: new Date().toISOString().split('T')[0],
  bdi_global: '25',
};

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

  // Sincroniza quando o servidor retorna resultados filtrados (busca)
  useEffect(() => { setOrcamentos(initialOrcamentos); }, [initialOrcamentos]);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [duplicateModal, setDuplicateModal] = useState<DuplicateModal | null>(null);
  const [novoModal, setNovoModal] = useState<NovoModal | null>(null);
  const [creating, setCreating] = useState(false);
  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [saving, setSaving] = useState(false);

  function updateNovo(field: keyof NovoModal, value: string) {
    setNovoModal(prev => prev ? { ...prev, [field]: value, error: undefined } : prev);
  }

  async function handleCreate() {
    if (!novoModal || creating) return;
    if (!novoModal.nome_obra.trim()) {
      setNovoModal(prev => prev ? { ...prev, error: 'Informe o nome da obra.' } : prev);
      return;
    }
    const bdi = parseFloat(novoModal.bdi_global);
    if (isNaN(bdi) || bdi < 0) {
      setNovoModal(prev => prev ? { ...prev, error: 'BDI inválido.' } : prev);
      return;
    }

    setCreating(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data, error: dbError } = await supabase
        .from('tabela_orcamentos')
        .insert({
          user_id: user.id,
          nome_obra: novoModal.nome_obra.trim(),
          cliente: novoModal.cliente.trim() || null,
          data: novoModal.data,
          bdi_global: bdi,
          codigo: novoModal.codigo,
        })
        .select('id')
        .single();

      if (dbError) {
        const isUnique = dbError.message.toLowerCase().includes('unique') || dbError.message.toLowerCase().includes('duplicate key');
        setNovoModal(prev => prev ? {
          ...prev,
          error: isUnique ? 'Este código já está em uso. Escolha outro.' : `Erro ao salvar: ${dbError.message}`,
        } : prev);
        return;
      }

      const newRow: OrcRow = {
        id: data.id,
        nome_obra: novoModal.nome_obra.trim(),
        cliente: novoModal.cliente.trim() || null,
        data: novoModal.data,
        bdi_global: bdi,
        codigo: novoModal.codigo,
        tabela_itens_orcamento: [],
        ultimo_acesso: null,
      };
      setOrcamentos(prev => [newRow, ...prev]);
      setNovoModal(null);
      startTransition(() => router.refresh());
    } catch {
      setNovoModal(prev => prev ? { ...prev, error: 'Erro ao salvar. Tente novamente.' } : prev);
    } finally {
      setCreating(false);
    }
  }

  function handleEditClick(e: React.MouseEvent, orc: OrcRow) {
    e.preventDefault();
    e.stopPropagation();
    setEditModal({
      id: orc.id,
      nome_obra: orc.nome_obra,
      codigo: orc.codigo,
      cliente: orc.cliente ?? '',
      data: orc.data,
      bdi_global: String(orc.bdi_global),
    });
  }

  function updateEdit(field: keyof EditModal, value: string) {
    setEditModal(prev => prev ? { ...prev, [field]: value, error: undefined } : prev);
  }

  async function handleSaveEdit() {
    if (!editModal || saving) return;
    if (!editModal.nome_obra.trim()) {
      setEditModal(prev => prev ? { ...prev, error: 'Informe o nome da obra.' } : prev);
      return;
    }
    const bdi = parseFloat(editModal.bdi_global);
    if (isNaN(bdi) || bdi < 0) {
      setEditModal(prev => prev ? { ...prev, error: 'BDI inválido.' } : prev);
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient() as any;
      const { error: dbError } = await supabase
        .from('tabela_orcamentos')
        .update({
          nome_obra: editModal.nome_obra.trim(),
          codigo: editModal.codigo,
          cliente: editModal.cliente.trim() || null,
          data: editModal.data,
          bdi_global: bdi,
        })
        .eq('id', editModal.id);

      if (dbError) {
        const isUnique = dbError.message.toLowerCase().includes('unique') || dbError.message.toLowerCase().includes('duplicate key');
        setEditModal(prev => prev ? {
          ...prev,
          error: isUnique ? 'Este código já está em uso. Escolha outro.' : `Erro ao salvar: ${dbError.message}`,
        } : prev);
        return;
      }

      setOrcamentos(prev => prev.map(o =>
        o.id === editModal.id
          ? { ...o, nome_obra: editModal.nome_obra.trim(), codigo: editModal.codigo, cliente: editModal.cliente.trim() || null, data: editModal.data, bdi_global: bdi }
          : o
      ));
      setEditModal(null);
      startTransition(() => router.refresh());
    } catch {
      setEditModal(prev => prev ? { ...prev, error: 'Erro ao salvar. Tente novamente.' } : prev);
    } finally {
      setSaving(false);
    }
  }

  function handleDuplicateClick(e: React.MouseEvent, orc: OrcRow) {
    e.preventDefault();
    e.stopPropagation();
    setDuplicateModal({ orc, codigo: '' });
  }

  async function confirmDuplicate() {
    if (!duplicateModal) return;
    const { orc, codigo } = duplicateModal;
    setDuplicateModal(null);
    setDuplicating(orc.id);
    try {
      const result = await duplicateOrcamento(orc.id, codigo);
      setOrcamentos(prev => [resultToRow(result, orc.tabela_itens_orcamento.length), ...prev]);
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isUnique = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate key');
      if (isUnique) {
        setDuplicateModal({ orc, codigo, error: 'Este código já está em uso. Escolha outro.' });
      } else {
        alert(`Erro ao duplicar: ${msg}`);
      }
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
    setOrcamentos(prev => prev.filter(o => o.id !== idToDelete));
    try {
      await deleteOrcamento(idToDelete);
    } catch (err: unknown) {
      startTransition(() => router.refresh());
      alert(`Erro ao excluir: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      {/* Cabeçalho com contagem e botão novo */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orçamentos</h1>
          <p className="mt-1 text-sm text-gray-500">{orcamentos.length} orçamento(s)</p>
        </div>
        <button
          onClick={() => setNovoModal({ ...NOVO_DEFAULT })}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Novo orçamento
        </button>
      </div>

      {/* Modal novo orçamento */}
      {novoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Novo orçamento</h2>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-600">Nome da obra *</label>
                  <input
                    autoFocus
                    value={novoModal.nome_obra}
                    onChange={e => updateNovo('nome_obra', e.target.value)}
                    onKeyDown={e => e.key === 'Escape' && setNovoModal(null)}
                    placeholder="Ex: Residência Unifamiliar"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Código *</label>
                  <input
                    value={novoModal.codigo}
                    onChange={e => updateNovo('codigo', e.target.value)}
                    onKeyDown={e => e.key === 'Escape' && setNovoModal(null)}
                    placeholder="Ex: ORC-2025-001"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Cliente</label>
                  <input
                    value={novoModal.cliente}
                    onChange={e => updateNovo('cliente', e.target.value)}
                    onKeyDown={e => e.key === 'Escape' && setNovoModal(null)}
                    placeholder="Ex: João Silva"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Data</label>
                  <input
                    type="date"
                    value={novoModal.data}
                    onChange={e => updateNovo('data', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">BDI global (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={novoModal.bdi_global}
                    onChange={e => updateNovo('bdi_global', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {novoModal.error && (
                <p className="text-xs text-red-600">{novoModal.error}</p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setNovoModal(null)}
                disabled={creating}
                className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !novoModal.nome_obra.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {creating ? 'Criando…' : 'Criar orçamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de edição */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Editar orçamento</h2>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <label className="text-xs font-medium text-gray-600">Nome da obra *</label>
                  <input
                    autoFocus
                    value={editModal.nome_obra}
                    onChange={e => updateEdit('nome_obra', e.target.value)}
                    onKeyDown={e => e.key === 'Escape' && setEditModal(null)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Código</label>
                  <input
                    value={editModal.codigo}
                    onChange={e => updateEdit('codigo', e.target.value)}
                    onKeyDown={e => e.key === 'Escape' && setEditModal(null)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Cliente</label>
                  <input
                    value={editModal.cliente}
                    onChange={e => updateEdit('cliente', e.target.value)}
                    onKeyDown={e => e.key === 'Escape' && setEditModal(null)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Data</label>
                  <input
                    type="date"
                    value={editModal.data}
                    onChange={e => updateEdit('data', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">BDI global (%)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editModal.bdi_global}
                    onChange={e => updateEdit('bdi_global', e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {editModal.error && (
                <p className="text-xs text-red-600">{editModal.error}</p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setEditModal(null)}
                disabled={saving}
                className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={saving || !editModal.nome_obra.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de duplicar */}
      {duplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Duplicar orçamento</h2>
            <p className="mt-2 text-sm text-gray-600">
              Informe o código do novo orçamento (cópia de{' '}
              <span className="font-medium text-gray-900">"{duplicateModal.orc.nome_obra}"</span>).
            </p>
            <input
              type="text"
              autoFocus
              placeholder="Ex: ORC-2025-002"
              value={duplicateModal.codigo}
              onChange={e => setDuplicateModal(prev => prev ? { ...prev, codigo: e.target.value, error: undefined } : prev)}
              onKeyDown={e => {
                if (e.key === 'Enter' && duplicateModal.codigo.trim()) confirmDuplicate();
                if (e.key === 'Escape') setDuplicateModal(null);
              }}
              className={`mt-4 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 ${duplicateModal.error ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
            />
            {duplicateModal.error && (
              <p className="mt-1.5 text-xs text-red-600">{duplicateModal.error}</p>
            )}
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setDuplicateModal(null)}
                className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDuplicate}
                disabled={!duplicateModal.codigo.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                Duplicar
              </button>
            </div>
          </div>
        </div>
      )}

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

      {orcamentos.length === 0 ? (
        <div className="rounded-xl border bg-white p-12 text-center shadow-sm">
          <p className="text-gray-400">Nenhum orçamento criado.</p>
          <button
            onClick={() => setNovoModal({ ...NOVO_DEFAULT })}
            className="mt-4 inline-block text-sm text-blue-600 hover:underline"
          >
            Criar primeiro orçamento →
          </button>
        </div>
      ) : (
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
                      <Link href={`/orcamentos/${orc.id}/planilha`} className="block w-full h-full">
                        {orc.codigo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <Link href={`/orcamentos/${orc.id}/planilha`} className="block w-full h-full">
                        {orc.nome_obra}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      <Link href={`/orcamentos/${orc.id}/planilha`} className="block w-full h-full">
                        {orc.cliente ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700">
                      <Link href={`/orcamentos/${orc.id}/planilha`} className="block w-full h-full">
                        {orc.bdi_global}%
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      <Link href={`/orcamentos/${orc.id}/planilha`} className="block w-full h-full">
                        {orc.tabela_itens_orcamento.length}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      <Link href={`/orcamentos/${orc.id}/planilha`} className="block w-full h-full">
                        {orc.ultimo_acesso
                          ? new Date(orc.ultimo_acesso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => handleEditClick(e, orc)}
                          disabled={isDeleting}
                          title="Editar orçamento"
                          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={(e) => handleDuplicateClick(e, orc)}
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
      )}
    </>
  );
}
