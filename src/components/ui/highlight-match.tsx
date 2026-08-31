import type { ReactNode } from 'react';

// Remove marcas diacríticas (acentos) após decompor em NFD — cada caractere
// acentuado comum do português (á, é, ç, ã, ...) decompõe em exatamente
// 1 base + 1 marca, então o texto normalizado mantém o mesmo comprimento e
// os mesmos índices do texto original (necessário pra mapear a posição do
// match de volta pro texto com acento, não a versão sem acento). Faixa
// "Combining Diacritical Marks" (U+0300-U+036F) construída via charCode pra
// não depender de caracteres literais no arquivo-fonte.
const DIACRITICS_RE = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g'
);
function normalize(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS_RE, '').toLowerCase();
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
