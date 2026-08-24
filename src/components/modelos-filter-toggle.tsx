'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { LayoutTemplate } from 'lucide-react';
import { useReliableReplace } from '@/lib/use-reliable-replace';

interface Props {
  /** Modo controlado: informe `active`+`onChange` para o componente não
   * tocar na URL/router (ver /orcamentos). Sem esses props, cai no modo
   * padrão (URL via router.replace). */
  active?: boolean;
  onChange?: (active: boolean) => void;
}

export function ModelosFilterToggle({ active: activeProp, onChange }: Props = {}) {
  const controlled = onChange !== undefined;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reliableReplace] = useReliableReplace();
  const active = controlled ? !!activeProp : searchParams.get('modelos') === '1';

  function toggle() {
    if (controlled) {
      onChange!(!active);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (active) {
      params.delete('modelos');
    } else {
      params.set('modelos', '1');
      params.delete('favoritos');
    }
    params.delete('page');
    reliableReplace(pathname, params);
  }

  return (
    <button
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-primary-300 bg-primary-50 text-primary-700'
          : 'border-gray-300 bg-white text-gray-600 hover:border-primary-300 hover:text-primary-700'
      }`}
    >
      <LayoutTemplate size={12} />
      Ver modelos
    </button>
  );
}
