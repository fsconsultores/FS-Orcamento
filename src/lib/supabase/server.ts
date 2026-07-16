import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './types';
import { recordQuery } from './query-stats';
import { recordQueryMetric } from '@/lib/dev-metrics/store';
import { getCurrentPath } from '@/lib/dev-metrics/current-path';

const DEV = process.env.NODE_ENV === 'development';

// Extrai "tabela" (ou rpc/nome) do path REST do PostgREST: /rest/v1/<recurso>?...
function recursoDaUrl(url: string): string {
  const m = url.match(/\/rest\/v1\/([^/?]+)/);
  return m ? decodeURIComponent(m[1]) : url.replace(/^https?:\/\/[^/]+/, '');
}

// PostgREST retorna Content-Range: "0-24/117" (linhas 0-24 de 117), "*/0" (0
// linhas) ou "0-9/*" (total desconhecido, count não pedido). Extrai a
// quantidade de linhas RETORNADAS (não o total) sem precisar ler o corpo da
// resposta — barato o suficiente para rodar em toda query, mesmo em dev.
function linhasDoContentRange(res: Response): number | null {
  const cr = res.headers.get('content-range')
  if (!cr) return null
  const m = cr.match(/^(\*|(\d+)-(\d+))\/(\*|\d+)$/)
  if (!m) return null
  if (m[1] === '*') return 0
  return Number(m[3]) - Number(m[2]) + 1
}

// Instrumentação de queries (dev-only): mede cada request ao PostgREST,
// registra em query-stats (resumo por navegação, ver (app)/layout.tsx) e no
// store persistente (dashboard /dev/performance), além de logar no console
// por faixa de severidade. Não roda em produção — custo zero fora de dev.
const instrumentedFetch: typeof fetch = DEV
  ? async (input, init) => {
      const start = performance.now();
      const res = await fetch(input, init);
      const durationMs = performance.now() - start;
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';
      const table = recursoDaUrl(url);
      const rows = linhasDoContentRange(res);
      recordQuery({ table, method, durationMs });
      const path = await getCurrentPath();
      recordQueryMetric({ table, method, durationMs, rows, path, timestamp: Date.now() });
      if (durationMs > 250) {
        console.log(`[supabase] 🔴 ${method} ${table} — ${durationMs.toFixed(0)}ms (>250ms)${rows != null ? ` · ${rows} linha(s)` : ''}`);
      } else if (durationMs > 100) {
        console.log(`[supabase] 🟠 ${method} ${table} — ${durationMs.toFixed(0)}ms (>100ms)${rows != null ? ` · ${rows} linha(s)` : ''}`);
      } else if (durationMs > 50) {
        console.log(`[supabase] 🟡 ${method} ${table} — ${durationMs.toFixed(0)}ms (>50ms)${rows != null ? ` · ${rows} linha(s)` : ''}`);
      }
      return res;
    }
  : fetch;

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;

  return createServerClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
      global: DEV ? { fetch: instrumentedFetch } : undefined,
    }
  );
}
