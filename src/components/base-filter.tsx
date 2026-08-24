'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useReliableReplace } from '@/lib/use-reliable-replace';

export const BASES_ORIGEM = ['SINAPI', 'DNIT', 'SUDECAP', 'DER', 'PROPRIA'] as const;
export type BaseOrigem = typeof BASES_ORIGEM[number];



export type BaseOption = { orgao: string; label: string };

interface BaseFilterProps {
  bases: BaseOption[];
  /** Modo controlado: informe `value`+`onChange` para o componente não
   * tocar na URL/router e só notificar o valor escolhido (usado quando o
   * pai já gerencia os dados via Server Action, ex: /insumos e
   * /composicoes — ver InsumosExplorer). Sem esses props, cai no modo
   * padrão (URL via router.replace). */
  value?: string;
  onChange?: (orgao: string) => void;
}

export function BaseFilter({ bases, value, onChange }: BaseFilterProps) {
  const controlled = onChange !== undefined;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reliableReplace] = useReliableReplace();
  const current = controlled ? (value ?? '') : (searchParams.get('orgao') ?? '');

  function select(orgao: string) {
    if (controlled) {
      onChange!(orgao);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (orgao) {
      params.set('orgao', orgao);
    } else {
      params.delete('orgao');
    }
    params.delete('page');
    reliableReplace(pathname, params);
  }

  if (bases.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => select('')}
        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          current === ''
            ? 'bg-primary-700 text-white border-primary-700'
            : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400 hover:text-primary-700'
        }`}
      >
        Todas
      </button>
      {bases.map((b) => (
        <button
          key={b.orgao}
          onClick={() => select(b.orgao)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            current === b.orgao
              ? 'bg-primary-700 text-white border-primary-700'
              : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400 hover:text-primary-700'
          }`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}



export function baseBadgeClass(tipoBase: string | null | undefined): string {
  if (tipoBase === 'propria') return 'bg-green-50 text-green-700 border-green-200';
  if (tipoBase === 'externa') return 'bg-gray-100 text-gray-600 border-gray-200';
  return 'bg-gray-50 text-gray-400 border-gray-100';
}
