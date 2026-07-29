'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { LayoutTemplate } from 'lucide-react';

export function ModelosFilterToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const active = searchParams.get('modelos') === '1';

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (active) {
      params.delete('modelos');
    } else {
      params.set('modelos', '1');
      params.delete('favoritos');
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
          ? 'border-primary-300 bg-primary-50 text-primary-700'
          : 'border-gray-300 bg-white text-gray-600 hover:border-primary-300 hover:text-primary-700'
      }`}
    >
      <LayoutTemplate size={12} />
      Ver modelos
    </button>
  );
}
