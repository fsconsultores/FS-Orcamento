'use client';

import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/button';

export interface TaxaAdministracaoItemForm {
  id?: string;
  descricao: string;
  percentual: string;
}

/** Editor de subgrupos da Taxa de Administração — reaproveitado na criação
 * do orçamento e em Configurações. Cada linha vira um item-filho do grupo
 * "Taxa de Administração" na planilha, calculado automaticamente como seu
 * percentual sobre o custo dos demais itens do projeto (mesma base pra
 * todos os subgrupos). O total do grupo é a soma de todos eles. */
export function TaxaAdministracaoItensEditor({
  itens,
  onChange,
}: {
  itens: TaxaAdministracaoItemForm[];
  onChange: (itens: TaxaAdministracaoItemForm[]) => void;
}) {
  function update(index: number, field: 'descricao' | 'percentual', value: string) {
    onChange(itens.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function add() {
    onChange([...itens, { descricao: '', percentual: '0' }]);
  }

  function remove(index: number) {
    onChange(itens.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Subgrupos da Taxa de Administração</label>
        <button type="button" onClick={add} className="flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline">
          <Plus size={12} /> Adicionar
        </button>
      </div>
      {itens.length === 0 && (
        <p className="text-xs text-gray-400">Nenhum subgrupo cadastrado — a Taxa de Administração ficará em R$ 0.</p>
      )}
      {itens.map((it, i) => (
        <div key={it.id ?? `new-${i}`} className="flex gap-2">
          <Input
            value={it.descricao}
            onChange={(e) => update(i, 'descricao', e.target.value)}
            placeholder="Descrição (ex: 12% sobre custos diretos)"
            className="flex-1"
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            value={it.percentual}
            onChange={(e) => update(i, 'percentual', e.target.value)}
            placeholder="%"
            className="w-28"
          />
          <IconButton label="Remover subgrupo" icon={<X size={14} />} variant="outline" onClick={() => remove(i)} />
        </div>
      ))}
      <p className="text-xs text-gray-400">
        Cada subgrupo vira um item na planilha, calculado automaticamente sobre o custo dos demais itens do projeto. O total do grupo &quot;Taxa de Administração&quot; é a soma de todos os subgrupos.
      </p>
    </div>
  );
}
