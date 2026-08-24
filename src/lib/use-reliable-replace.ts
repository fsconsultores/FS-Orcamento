'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useTransition } from 'react';

const SOFT_ATTEMPTS = 1;
const CHECK_DELAY_MS = 1200;

/**
 * router.replace()+router.refresh() intermitentemente não aplicam a
 * navegação em produção (next start) nesta versão do Next — o fetch RSC
 * retorna 200 mas a URL/tabela às vezes não atualizam (falha silenciosa,
 * sem erro no console; não reproduz em `next dev`). Reproduzido de forma
 * consistente em /insumos e /composicoes: buscas "não filtravam nada" com
 * bastante frequência, e tentar de novo a mesma navegação soft nem sempre
 * resolve (parece ficar "preso" por instância de página, não só uma
 * corrida de rede pontual). Este hook tenta a navegação soft (client-side,
 * sem reload) até SOFT_ATTEMPTS vezes; se depois disso a URL ainda não
 * refletir o alvo, força um reload de página inteira (window.location),
 * que não depende do router do Next e portanto não pode falhar do mesmo
 * jeito — garante que a busca/filtro sempre acaba aplicando.
 */
export function useReliableReplace() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const tokenRef = useRef(0);

  const replace = useCallback((pathname: string, params: URLSearchParams) => {
    const search = params.toString();
    const expectedSearch = search ? `?${search}` : '';
    const target = `${pathname}${expectedSearch}`;
    const myToken = ++tokenRef.current;

    function applied() {
      return window.location.pathname === pathname && window.location.search === expectedSearch;
    }

    function attempt(triesLeft: number) {
      startTransition(() => {
        router.replace(target as any);
        router.refresh();
      });
      setTimeout(() => {
        if (tokenRef.current !== myToken || applied()) return;
        if (triesLeft > 0) {
          attempt(triesLeft - 1);
        } else {
          window.location.href = target;
        }
      }, CHECK_DELAY_MS);
    }

    attempt(SOFT_ATTEMPTS - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return [replace, isPending] as const;
}
