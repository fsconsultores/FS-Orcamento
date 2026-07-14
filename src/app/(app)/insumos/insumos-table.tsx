'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Package, Download } from 'lucide-react';
import { formatCurrency } from '@/lib/costs';
import { baseBadgeClass } from '@/components/base-filter';
import { baseLabelFromOrgao } from '@/components/base-labels';
import type { InsumoComBase } from '@/lib/supabase/types';
import { createClient } from '@/lib/supabase/client';
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectionBar } from '@/components/ui/toolbar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { ExportXlsxButton } from '@/components/export-xlsx-button';

export function InsumosTable({ initialInsumos }: { initialInsumos: InsumoComBase[] }) {
  const [insumos, setInsumos] = useState(initialInsumos);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toast = useToast();

  function startEdit(ins: InsumoComBase, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(ins.id);
    setEditingValue(String(ins.preco_base));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingValue('');
  }

  async function saveEdit(id: string, rawValue?: string) {
    if (savingId) return;
    const str = (rawValue ?? editingValue).trim().replace(',', '.');
    const parsed = str === '' ? 0 : parseFloat(str);
    if (isNaN(parsed) || parsed < 0) { cancelEdit(); return; }
    const current = insumos.find(ins => ins.id === id);
    if (current && parsed === current.preco_base) { cancelEdit(); return; }

    setEditingId(null);
    setInsumos(prev => prev.map(ins => ins.id === id ? { ...ins, preco_base: parsed } : ins));

    setSavingId(id);
    try {
      const sb = createClient() as any;
      await sb.from('tabela_insumos').update({ preco_base: parsed }).eq('id', id);
      const { data: { user } } = await sb.auth.getUser();
      await sb.from('tabela_historico_precos').insert({
        insumo_id:      id,
        preco_anterior: current?.preco_base ?? null,
        preco_novo:     parsed,
        origem:         'manual',
        usuario:        user?.email ?? null,
      });
    } catch {
      setInsumos(prev => prev.map(ins => ins.id === id && current ? { ...ins, preco_base: current.preco_base } : ins));
      toast.show('Não foi possível salvar o novo custo. Tente novamente em alguns segundos.', 'error');
    } finally {
      setSavingId(null);
    }
  }

  function toggleAll() {
    setSelected(prev => prev.size === insumos.length ? new Set() : new Set(insumos.map(i => i.id)));
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedRows = insumos.filter(i => selected.has(i.id));

  if (insumos.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <EmptyState
          icon={<Package size={20} />}
          title="Nenhum insumo encontrado"
          description="Ajuste a busca ou os filtros, ou importe uma base de dados para começar."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SelectionBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        actions={
          <ExportXlsxButton
            rows={selectedRows.map(ins => ({
              'Código': ins.codigo,
              'Descrição': ins.descricao,
              'Grupo': ins.grupo ?? '',
              'Unidade': ins.unidade,
              'Custo': ins.preco_base,
              'Base': ins.base_origem ?? (ins.tabela_bases ? baseLabelFromOrgao(ins.tabela_bases.orgao) : ''),
            }))}
            sheetName="Insumos"
            fileName="insumos_selecionados.xlsx"
          />
        }
      />

      <Table>
        <Thead>
          <Th className="w-9"><Checkbox checked={selected.size === insumos.length} onChange={toggleAll} aria-label="Selecionar todos" /></Th>
          <Th className="w-28">Código</Th>
          <Th>Descrição</Th>
          <Th className="w-36">Grupo</Th>
          <Th className="w-20">Unidade</Th>
          <Th className="w-36 text-right">Custo</Th>
          <Th className="w-32">Base</Th>
          <Th className="w-28">Data ref.</Th>
        </Thead>
        <Tbody>
          {insumos.map((ins) => (
            <Tr key={ins.id} className={selected.has(ins.id) ? 'bg-primary-50/60' : ''}>
              <Td className="!py-2">
                <Checkbox checked={selected.has(ins.id)} onChange={() => toggleOne(ins.id)} aria-label={`Selecionar ${ins.descricao}`} />
              </Td>
              <Td className="!p-0 font-mono text-xs text-gray-500">
                <Link href={`/insumos/${ins.id}/editar`} className="block px-4 py-2">{ins.codigo}</Link>
              </Td>
              <Td className="!p-0 text-gray-900">
                <Link href={`/insumos/${ins.id}/editar`} className="block px-4 py-2">{ins.descricao}</Link>
              </Td>
              <Td className="!p-0 text-gray-600">
                <Link href={`/insumos/${ins.id}/editar`} className="block px-4 py-2">{ins.grupo ?? '—'}</Link>
              </Td>
              <Td className="!p-0 text-gray-600">
                <Link href={`/insumos/${ins.id}/editar`} className="block px-4 py-2">{ins.unidade}</Link>
              </Td>
              <Td className="!py-1.5 text-right">
                {editingId === ins.id ? (
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    step="0.0001"
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={(e) => saveEdit(ins.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); saveEdit(ins.id, (e.target as HTMLInputElement).value); }
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    className="w-full rounded border border-primary-400 bg-white px-1.5 py-0.5 text-right text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40"
                  />
                ) : (
                  <button
                    onClick={(e) => startEdit(ins, e)}
                    title="Clique para editar o custo"
                    className={`block w-full text-right font-medium tabular-nums ${
                      savingId === ins.id
                        ? 'cursor-wait text-gray-400'
                        : 'cursor-text text-gray-900 hover:text-primary-700 hover:underline'
                    }`}
                  >
                    {savingId === ins.id ? '…' : formatCurrency(ins.preco_base)}
                  </button>
                )}
              </Td>
              <Td className="!p-0">
                <Link href={`/insumos/${ins.id}/editar`} className="block px-4 py-2">
                  {ins.base_origem && ins.tabela_bases?.tipo_base === 'propria' ? (
                    <Badge variant="brand">{ins.base_origem}</Badge>
                  ) : ins.tabela_bases ? (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${baseBadgeClass(ins.tabela_bases.tipo_base)}`}>
                      {baseLabelFromOrgao(ins.tabela_bases.orgao)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </Link>
              </Td>
              <Td className="!p-0 text-gray-500">
                <Link href={`/insumos/${ins.id}/editar`} className="block px-4 py-2">
                  {ins.data_referencia ? new Date(ins.data_referencia).toLocaleDateString('pt-BR') : '—'}
                </Link>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
