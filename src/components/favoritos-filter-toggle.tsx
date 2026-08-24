'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Star } from 'lucide-react';
import { useReliableReplace } from '@/lib/use-reliable-replace';

interface Props {
  /** Modo controlado: informe `active`+`onChange` para o componente não
   * tocar na URL/router (ver /insumos e /composicoes). Sem esses props,
   * cai no modo padrão (URL via router.replace). */
  active?: boolean;
  onChange?: (active: boolean) => void;
}

export function FavoritosFilterToggle({ active: activeProp, onChange }: Props = {}) {
  const controlled = onChange !== undefined;
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [reliableReplace] = useReliableReplace();
  const active = controlled ? !!activeProp : searchParams.get('favoritos') === '1';

  function toggle() {
    if (controlled) {
      onChange!(!active);
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    if (active) {
      params.delete('favoritos');
    } else {
      params.set('favoritos', '1');
    }
    params.delete('page');
    reliableReplace(pathname, params);
  }

  return (
    <button
      onClick={toggle}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? 'border-amber-300 bg-amber-50 text-amber-700'
          : 'border-gray-300 bg-white text-gray-600 hover:border-amber-300 hover:text-amber-700'
      }`}
    >
      <Star size={12} fill={active ? 'currentColor' : 'none'} />
      Somente favoritos
    </button>
  );
}
