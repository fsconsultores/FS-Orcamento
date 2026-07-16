import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { SidebarShell } from '@/components/sidebar-shell';
import { getQueryStats } from '@/lib/supabase/query-stats';
import { recordPageLoadMetric } from '@/lib/dev-metrics/store';
import { getCurrentPath } from '@/lib/dev-metrics/current-path';
import { WebVitalsReporter } from '@/components/web-vitals-reporter';
import { NavTracker } from '@/components/nav-tracker';

const DEV = process.env.NODE_ENV === 'development';

// Limite de queries por navegação antes de logar um alerta — regressão
// óbvia (N+1 reintroduzido, loop sequencial, etc.) costuma disparar isso
// muito antes de virar lentidão perceptível. Ajustável via env var.
const MAX_QUERIES_PER_PAGE = Number(process.env.DEV_MAX_QUERIES_PER_PAGE ?? 15);

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Instrumentação dev-only: resumo de queries desta navegação (quantidade +
  // tempo total), alimenta o dashboard /dev/performance e alerta se passar
  // do limite configurado. Roda depois da resposta (after), sem custo
  // perceptível, e não existe em produção (NODE_ENV !== 'development'
  // desliga tudo aqui e em src/lib/supabase/server.ts).
  if (DEV) {
    const path = await getCurrentPath();
    after(() => {
      const stats = getQueryStats();
      if (stats.length === 0) return;
      const total = stats.reduce((sum, q) => sum + q.durationMs, 0);
      console.log(`[perf] ${stats.length} queries · ${total.toFixed(0)}ms total${path ? ` · ${path}` : ''}`);
      if (stats.length > MAX_QUERIES_PER_PAGE) {
        console.warn(`[perf] ⚠️ ${path ?? 'página'} fez ${stats.length} queries (limite: ${MAX_QUERIES_PER_PAGE}) — possível N+1 ou consulta duplicada`);
      }
      recordPageLoadMetric({ path: path ?? 'desconhecido', queryCount: stats.length, queryTimeMs: total, timestamp: Date.now() });
    });
  }

  return (
    <SidebarShell userEmail={user.email ?? ''}>
      {DEV && <WebVitalsReporter />}
      {DEV && <NavTracker />}
      {children}
    </SidebarShell>
  );
}
