'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

export const BASES_ORIGEM = ['SINAPI', 'DNIT', 'SUDECAP', 'DER', 'PROPRIA'] as const;
export type BaseOrigem = typeof BASES_ORIGEM[number];

export function BaseOrigemFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const current = searchParams.get('origem') ?? '';

  function select(origem: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (origem) params.set('origem', origem);
    else params.delete('origem');
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}` as any);
    });
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-xs font-medium text-gray-400 mr-0.5">Origem:</span>
      <button
        onClick={() => select('')}
        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          current === ''
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
        }`}
      >
        Todas
      </button>
      {BASES_ORIGEM.map((o) => (
        <button
          key={o}
          onClick={() => select(o)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            current === o
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
          }`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

export type BaseOption = { orgao: string; label: string };

export function BaseFilter({ bases }: { bases: BaseOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const current = searchParams.get('orgao') ?? '';

  function select(orgao: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (orgao) {
      params.set('orgao', orgao);
    } else {
      params.delete('orgao');
    }
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}` as any);
    });
  }

  if (bases.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      <button
        onClick={() => select('')}
        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          current === ''
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
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
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
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
