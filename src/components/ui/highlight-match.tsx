import type { ReactNode } from 'react';
import { stripDiacritics } from '@/lib/text-normalize';

// Só minúsculo + sem acento, SEM trim/colapsar espaço — precisa preservar
// comprimento e posição de cada caractere do texto original pra mapear o
// match encontrado aqui de volta pro texto acentuado exibido na tela.
function normalize(s: string): string {
  return stripDiacritics(s).toLowerCase();
}

/** Realça a(s) parte(s) de `text` que batem com `query` — case e
 * acento-insensitive (mesmo critério usado pelas buscas do sistema, seja via
 * `ilike` no banco ou filtro normalizado no client, ex: report-list.tsx) —
 * usado em toda tela com busca (insumos, composições, orçamentos, logs,
 * relatórios, autocompletes) pra mostrar onde o termo buscado aparece dentro
 * do texto. Sem query ou sem match, renderiza o texto normalmente. */
export function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = normalize(query.trim());
  if (!q) return <>{text}</>;

  const normText = normalize(text);
  let cursor = 0;
  let idx = normText.indexOf(q, cursor);
  if (idx === -1) return <>{text}</>;

  const parts: ReactNode[] = [];
  let key = 0;
  while (idx !== -1) {
    if (idx > cursor) parts.push(text.slice(cursor, idx));
    parts.push(
      <mark key={key++} className="rounded-[2px] bg-amber-200 text-inherit">
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    cursor = idx + q.length;
    idx = normText.indexOf(q, cursor);
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return <>{parts}</>;
}
