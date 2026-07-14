'use client'

import type { AbcClasse } from '@/lib/orcamento/caderno'
import { CATEGORIA_ANALITICA_LABELS, CATEGORIA_ANALITICA_ORDEM, type CategoriaAnalitica } from '@/lib/orcamento/analitica-filtros'
import type { AnaliticaFilterState, AnaliticaModo } from '../exporters/export-planilha-analitica'
import { Checkbox } from '@/components/ui/checkbox'

interface Props {
  value: AnaliticaFilterState
  onChange: (next: AnaliticaFilterState) => void
}

const MODOS: { value: AnaliticaModo; label: string; desc: string }[] = [
  { value: 'normal', label: 'Analítica Normal', desc: 'Insumos de cada serviço, sem expandir sub-composições.' },
  { value: 'decomposta', label: 'Analítica Decomposta', desc: 'Expande também as sub-composições, recursivamente.' },
  { value: 'agrupada', label: 'Agrupada por tipo de insumo', desc: 'Ignora a hierarquia e soma cada insumo por categoria.' },
]

const CLASSES: AbcClasse[] = ['A', 'B', 'C']

export function AnaliticaFilters({ value, onChange }: Props) {
  function toggleSet<T>(set: Set<T>, item: T, allValues: T[]): Set<T> {
    const current = set.size === 0 ? new Set(allValues) : new Set(set)
    if (current.has(item)) current.delete(item); else current.add(item)
    return current.size === allValues.length ? new Set<T>() : current
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Modo</p>
        <div className="space-y-1.5">
          {MODOS.map(m => (
            <label key={m.value} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="radio" name="analitica-modo" className="accent-primary-600 mt-0.5" checked={value.modo === m.value}
                onChange={() => onChange({ ...value, modo: m.value })} />
              <span>
                {m.label}
                <span className="block text-xs text-gray-400">{m.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-700 mb-2">Categoria de insumo</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {CATEGORIA_ANALITICA_ORDEM.map(cat => (
            <label key={cat} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <Checkbox
                checked={value.categorias.size === 0 || value.categorias.has(cat)}
                onChange={() => onChange({ ...value, categorias: toggleSet(value.categorias, cat, CATEGORIA_ANALITICA_ORDEM) })} />
              {CATEGORIA_ANALITICA_LABELS[cat]}
            </label>
          ))}
        </div>
      </div>

      {value.modo !== 'agrupada' && (
        <div>
          <p className="text-xs font-semibold text-gray-700 mb-2">Classes ABC</p>
          <div className="flex gap-4">
            {CLASSES.map(cls => (
              <label key={cls} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                <Checkbox
                  checked={value.classesAbc.size === 0 || value.classesAbc.has(cls)}
                  onChange={() => onChange({ ...value, classesAbc: toggleSet(value.classesAbc, cls, CLASSES) })} />
                Classe {cls}
              </label>
            ))}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <Checkbox checked={value.mostrarPrecos}
          onChange={() => onChange({ ...value, mostrarPrecos: !value.mostrarPrecos })} />
        Mostrar preços (unitário e total)
      </label>
    </div>
  )
}
