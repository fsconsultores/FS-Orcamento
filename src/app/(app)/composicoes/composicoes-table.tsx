'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Layers3 } from 'lucide-react';
import { formatCurrency } from '@/lib/costs';
import { baseBadgeClass } from '@/components/base-filter';
import { baseLabelFromOrgao } from '@/components/base-labels';
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { SelectionBar } from '@/components/ui/toolbar';
import { ExportXlsxButton } from '@/components/export-xlsx-button';

type ComposicaoRow = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  base_id: string | null;
  orgao: string | null;
  tipo_base: string | null;
  custo_unitario: number;
  base_origem: string | null;
};

export function ComposicoesTable({ initialComposicoes }: { initialComposicoes: ComposicaoRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleAll() {
    setSelected(prev => prev.size === initialComposicoes.length ? new Set() : new Set(initialComposicoes.map(c => c.id)));
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (initialComposicoes.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <EmptyState
          icon={<Layers3 size={20} />}
          title="Nenhuma composição encontrada"
          description="Ajuste a busca ou os filtros, ou importe uma base de dados para começar."
        />
      </div>
    );
  }

  const selectedRows = initialComposicoes.filter(c => selected.has(c.id));

  return (
    <div className="space-y-3">
      <SelectionBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        actions={
          <ExportXlsxButton
            rows={selectedRows.map(c => ({
              'Código': c.codigo,
              'Descrição': c.descricao,
              'Unidade': c.unidade,
              'Custo unitário': c.custo_unitario,
              'Base': c.base_origem ?? (c.orgao ? baseLabelFromOrgao(c.orgao) : ''),
            }))}
            sheetName="Composicoes"
            fileName="composicoes_selecionadas.xlsx"
          />
        }
      />

      <Table>
        <Thead>
          <Th className="w-9"><Checkbox checked={selected.size === initialComposicoes.length} onChange={toggleAll} aria-label="Selecionar todas" /></Th>
          <Th className="w-28">Código</Th>
          <Th>Descrição</Th>
          <Th className="w-20">Unidade</Th>
          <Th className="w-32">Base</Th>
          <Th className="w-32 text-right">Custo unitário</Th>
        </Thead>
        <Tbody>
          {initialComposicoes.map((c) => (
            <Tr key={c.id} className={selected.has(c.id) ? 'bg-primary-50/60' : ''}>
              <Td className="!py-2">
                <Checkbox checked={selected.has(c.id)} onChange={() => toggleOne(c.id)} aria-label={`Selecionar ${c.descricao}`} />
              </Td>
              <Td className="!p-0 font-mono text-xs text-gray-500">
                <Link href={`/composicoes/${c.id}`} className="block px-4 py-2">{c.codigo}</Link>
              </Td>
              <Td className="!p-0 text-gray-900">
                <Link href={`/composicoes/${c.id}`} className="block px-4 py-2">{c.descricao}</Link>
              </Td>
              <Td className="!p-0 text-gray-600">
                <Link href={`/composicoes/${c.id}`} className="block px-4 py-2">{c.unidade}</Link>
              </Td>
              <Td className="!p-0">
                <Link href={`/composicoes/${c.id}`} className="block px-4 py-2">
                  {c.base_origem && c.tipo_base === 'propria' ? (
                    <Badge variant="brand">{c.base_origem}</Badge>
                  ) : c.orgao ? (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${baseBadgeClass(c.tipo_base)}`}>
                      {baseLabelFromOrgao(c.orgao)}
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </Link>
              </Td>
              <Td className="!p-0 text-right font-medium text-gray-900">
                <Link href={`/composicoes/${c.id}`} className="block px-4 py-2">{formatCurrency(c.custo_unitario)}</Link>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </div>
  );
}
