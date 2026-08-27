'use client';

import type { ModeloAcrescimo } from '@/lib/orcamento/modelo-acrescimo';

const OPCOES: { valor: ModeloAcrescimo; titulo: string; descricao: string }[] = [
  { valor: 'sem_taxa', titulo: 'Sem taxa', descricao: 'Nenhum acréscimo é aplicado sobre o custo direto.' },
  { valor: 'taxa_administracao', titulo: 'Taxa de Administração', descricao: 'Um item "Taxa de Administração" é criado e recalculado automaticamente na planilha, no percentual informado sobre o custo dos demais itens.' },
  { valor: 'bdi', titulo: 'BDI', descricao: 'Percentual de BDI aplicado sobre o custo direto de todo o orçamento.' },
];

/** Seletor único de modelo de acréscimo — reaproveitado na criação do
 * orçamento e em Configurações. Os três modos são sempre mutuamente
 * exclusivos por construção (um único campo, um único valor selecionado). */
export function ModeloAcrescimoSelect({
  value,
  onChange,
}: {
  value: ModeloAcrescimo;
  onChange: (v: ModeloAcrescimo) => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">Modelo de acréscimo</label>
      <div className="grid gap-2 sm:grid-cols-3">
        {OPCOES.map((op) => {
          const checked = value === op.valor;
          return (
            <label
              key={op.valor}
              className={`flex flex-col gap-1 cursor-pointer rounded-lg border px-3 py-2 transition-colors ${
                checked ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="modelo_acrescimo"
                  checked={checked}
                  onChange={() => onChange(op.valor)}
                  className="accent-blue-600"
                />
                <span className={`text-sm font-medium ${checked ? 'text-blue-700' : 'text-gray-800'}`}>
                  {op.titulo}
                </span>
              </span>
              <span className="text-xs text-gray-400">{op.descricao}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
