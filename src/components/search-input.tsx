'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useRef } from 'react';
import { useReliableReplace } from '@/lib/use-reliable-replace';

interface Props {
  placeholder?: string;
  param?: string;
  debounce?: number;
  /** Modo controlado: informe `initialValue`+`onChange` para o componente
   * não tocar na URL/router e só notificar (com debounce) o texto digitado
   * — usado quando o pai já gerencia os dados via Server Action (ver
   * /insumos e /composicoes). Sem esses props, cai no modo padrão (URL via
   * router.replace). */
  initialValue?: string;
  onChange?: (value: string) => void;
}

export function SearchInput({ placeholder = 'Buscar...', param = 'q', debounce = 300, initialValue, onChange }: Props) {
  const controlled = onChange !== undefined;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reliableReplace] = useReliableReplace();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(value: string) {
    if (controlled) {
      onChange!(value);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(param, value);
    } else {
      params.delete(param);
    }
    params.delete('page');
    reliableReplace(pathname, params);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value.trim();
    if (debounce > 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => navigate(value), debounce);
    } else {
      navigate(value);
    }
  }

  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="search"
        defaultValue={controlled ? (initialValue ?? '') : (searchParams.get(param) ?? '')}
        onChange={handleChange}
        placeholder={placeholder}
        className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
      />
    </div>
  );
}
