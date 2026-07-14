'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useTransition, useState, useEffect } from 'react';
import { Plus, Pencil, Copy, Trash2, FolderPlus } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { duplicateOrcamento, deleteOrcamento } from './actions';
import type { DuplicateResult } from '@/lib/orcamento/duplicate';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';

type OrcRow = {
  id: string;
  nome_obra: string;
  cliente: string | null;
  data: string;
  bdi_global: number;
  codigo: string;
  tabela_itens_orcamento: { id: string }[];
  ultimo_acesso: string | null;
  created_at: string | null;
};

interface Props {
  initialOrcamentos: OrcRow[];
  totaisMap: Record<string, number>;
  children?: React.ReactNode;
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

interface EditModal {
  id: string;
  nome_obra: string;
  codigo: string;
  cliente: string;
  data: string;
  bdi_global: string;
  error?: string;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
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
    created_at: new Date().toISOString(),
  };
}

export function OrcamentosGrid({ initialOrcamentos, children }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [, startTransition] = useTransition();
  const [orcamentos, setOrcamentos] = useState<OrcRow[]>(initialOrcamentos);

  // Sincroniza quando o servidor retorna resultados filtrados (busca)
  useEffect(() => { setOrcamentos(initialOrcamentos); }, [initialOrcamentos]);
  // Cache local de created_at — persiste no localStorage enquanto PostgREST não retorna a coluna
  const [createdAtCache, setCreatedAtCache] = useState<Record<string, string>>({});
  useEffect(() => {
    // Carrega do localStorage na montagem
    try {
      const stored = JSON.parse(localStorage.getItem('orc_cat') ?? '{}');
      setCreatedAtCache(stored);
    } catch {}
  }, []);
  useEffect(() => {
    // Mescla dados do servidor (quando created_at começar a vir)
    setCreatedAtCache(prev => {
      const next = { ...prev };
      let changed = false;
      for (const o of initialOrcamentos) {
        if (o.created_at && !next[o.id]) { next[o.id] = o.created_at; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [initialOrcamentos]);

  function addToCache(id: string, ts: string) {
    setCreatedAtCache(prev => {
      const next = { ...prev, [id]: ts };
      try { localStorage.setItem('orc_cat', JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [duplicateModal, setDuplicateModal] = useState<DuplicateModal | null>(null);
  const [editModal, setEditModal] = useState<EditModal | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingConfirmed, setDeletingConfirmed] = useState(false);

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
      toast.show('Orçamento salvo.');
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

    // Adiciona linha otimista imediatamente
    const tempId = `pending-${crypto.randomUUID()}`;
    const optimisticRow: OrcRow = {
      id: tempId,
      nome_obra: `Cópia de ${orc.nome_obra}`,
      cliente: orc.cliente,
      data: orc.data,
      bdi_global: orc.bdi_global,
      codigo,
      tabela_itens_orcamento: orc.tabela_itens_orcamento,
      ultimo_acesso: null,
      created_at: new Date().toISOString(),
    };
    setOrcamentos(prev => [optimisticRow, ...prev]);
    setPendingIds(prev => new Set([...prev, tempId]));

    try {
      const result = await duplicateOrcamento(orc.id, codigo);
      const realRow = resultToRow(result, orc.tabela_itens_orcamento.length);
      addToCache(realRow.id, realRow.created_at as string);
      setOrcamentos(prev => prev.map(o => o.id === tempId ? realRow : o));
      setPendingIds(prev => { const s = new Set(prev); s.delete(tempId); return s; });
      toast.show('Orçamento duplicado.');
      startTransition(() => router.refresh());
    } catch (err: unknown) {
      setOrcamentos(prev => prev.filter(o => o.id !== tempId));
      setPendingIds(prev => { const s = new Set(prev); s.delete(tempId); return s; });
      const msg = err instanceof Error ? err.message : String(err);
      const isUnique = msg.toLowerCase().includes('unique') || msg.toLowerCase().includes('duplicate key');
      if (isUnique) {
        setDuplicateModal({ orc, codigo, error: 'Este código já está em uso. Escolha outro.' });
      } else {
        toast.show(`Erro ao duplicar: ${msg}`, 'error');
      }
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
    setDeletingConfirmed(true);
    setDeleting(idToDelete);
    try {
      await deleteOrcamento(idToDelete);
      setOrcamentos(prev => prev.filter(o => o.id !== idToDelete));
      toast.show('Orçamento excluído.');
      setConfirm(null);
    } catch (err: unknown) {
      startTransition(() => router.refresh());
      toast.show(`Erro ao excluir: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      setDeleting(null);
      setDeletingConfirmed(false);
    }
  }

  return (
    <>
      {/* Cabeçalho com contagem e botão novo */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Orçamentos</h1>
          <p className="mt-1 text-sm text-gray-500">{orcamentos.length} orçamento(s)</p>
        </div>
        <Button onClick={() => router.push('/orcamentos/novo')} icon={<Plus size={15} />}>
          Novo orçamento
        </Button>
      </div>

      {children}

      {/* Modal de edição */}
      <Modal
        open={!!editModal}
        onClose={() => !saving && setEditModal(null)}
        title="Editar orçamento"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setEditModal(null)} disabled={saving}>Cancelar</Button>
            <Button size="sm" onClick={handleSaveEdit} loading={saving} disabled={!editModal?.nome_obra.trim()}>Salvar</Button>
          </>
        }
      >
        {editModal && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Input
                autoFocus
                label="Nome da obra"
                required
                value={editModal.nome_obra}
                onChange={e => updateEdit('nome_obra', e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setEditModal(null)}
              />
            </div>
            <Input label="Código" value={editModal.codigo} onChange={e => updateEdit('codigo', e.target.value)} />
            <Input label="Cliente" value={editModal.cliente} onChange={e => updateEdit('cliente', e.target.value)} />
            <Input type="date" label="Data" value={editModal.data} onChange={e => updateEdit('data', e.target.value)} />
            <Input type="number" min="0" step="0.01" label="BDI global (%)" value={editModal.bdi_global} onChange={e => updateEdit('bdi_global', e.target.value)} />
            {editModal.error && <p className="col-span-2 text-xs text-red-600">{editModal.error}</p>}
          </div>
        )}
      </Modal>

      {/* Modal de duplicar */}
      <Modal
        open={!!duplicateModal}
        onClose={() => setDuplicateModal(null)}
        title="Duplicar orçamento"
        size="sm"
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setDuplicateModal(null)}>Cancelar</Button>
            <Button size="sm" onClick={confirmDuplicate} disabled={!duplicateModal?.codigo.trim()}>Duplicar</Button>
          </>
        }
      >
        {duplicateModal && (
          <>
            <p className="mb-3 text-sm text-gray-600">
              Informe o código do novo orçamento (cópia de{' '}
              <span className="font-medium text-gray-900">&quot;{duplicateModal.orc.nome_obra}&quot;</span>).
            </p>
            <Input
              autoFocus
              placeholder="Ex: ORC-2025-002"
              value={duplicateModal.codigo}
              error={duplicateModal.error}
              onChange={e => setDuplicateModal(prev => prev ? { ...prev, codigo: e.target.value, error: undefined } : prev)}
              onKeyDown={e => {
                if (e.key === 'Enter' && duplicateModal.codigo.trim()) confirmDuplicate();
                if (e.key === 'Escape') setDuplicateModal(null);
              }}
            />
          </>
        )}
      </Modal>

      {/* Modal de confirmação de exclusão */}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={confirmDelete}
        title="Excluir orçamento"
        description={`Tem certeza que deseja excluir "${confirm?.nome ?? ''}"? Esta ação é irreversível — todos os itens, insumos e composições serão removidos.`}
        confirmLabel="Excluir"
        danger
        loading={deletingConfirmed}
      />

      {orcamentos.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <EmptyState
            icon={<FolderPlus size={20} />}
            title="Nenhum orçamento criado"
            description="Comece cadastrando o primeiro orçamento do sistema."
            action={
              <Button size="sm" icon={<Plus size={14} />} onClick={() => router.push('/orcamentos/novo')}>
                Criar primeiro orçamento
              </Button>
            }
          />
        </div>
      ) : (
        <Table>
          <Thead>
            <Th className="w-28">Código</Th>
            <Th>Nome da Obra</Th>
            <Th>Cliente</Th>
            <Th>Inclusão</Th>
            <Th />
          </Thead>
          <Tbody>
            {orcamentos.map((orc) => {
              const isDeleting = deleting === orc.id;
              const isPending = pendingIds.has(orc.id);
              return (
                <Tr
                  key={orc.id}
                  onClick={() => {
                    if (isPending || isDeleting) return;
                    router.push(`/orcamentos/${orc.id}`);
                  }}
                  className={`transition-all ${isPending ? 'pointer-events-none animate-pulse bg-primary-50 opacity-60' : 'cursor-pointer'} ${isDeleting ? 'opacity-40' : ''}`}
                >
                  <Td className="font-mono text-xs text-gray-500">{orc.codigo}</Td>
                  <Td className="font-medium text-gray-900">{orc.nome_obra}</Td>
                  <Td className="text-gray-600">{orc.cliente ?? '—'}</Td>
                  <Td className="text-gray-500">{formatDateTime(createdAtCache[orc.id] ?? orc.created_at)}</Td>
                  <Td>
                    {isPending ? (
                      <div className="flex items-center justify-end">
                        <span className="text-xs italic text-primary-500">Duplicando…</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <IconButton label="Editar" icon={<Pencil size={14} />} disabled={isDeleting} onClick={(e) => handleEditClick(e, orc)} />
                        <IconButton label="Duplicar" icon={<Copy size={14} />} disabled={isDeleting} onClick={(e) => handleDuplicateClick(e, orc)} />
                        <IconButton label="Excluir" icon={<Trash2 size={14} />} variant="danger" disabled={isDeleting} onClick={(e) => handleDeleteClick(e, orc)} className="!bg-transparent !text-red-500 hover:!bg-red-50" />
                      </div>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      )}
    </>
  );
}
