'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Star } from 'lucide-react';

export function FavoritosFilterToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const active = searchParams.get('favoritos') === '1';

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (active) {
      params.delete('favoritos');
    } else {
      params.set('favoritos', '1');
    }
    params.delete('page');
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}` as any);
    });
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
