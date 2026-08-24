'use client';

import type { BaseDetailTab } from './types';

/** Controlado pelo pai (BaseDetailExplorer) — antes usava `<a>` nativo pra
 * forçar reload cheio, workaround pro mesmo bug sistêmico do router
 * client-side do Next (staleTimes em next.config.ts). Agora a troca de aba
 * chama uma Server Action direto, sem navegar, então não precisa mais do
 * reload nem do <Link> problemático. */
export function BaseTabs({ tab, onChange }: { tab: BaseDetailTab; onChange: (tab: BaseDetailTab) => void }) {
  return (
    <div className="flex gap-0 border-b border-gray-200">
      {([
        { key: 'insumos', label: 'Insumos' },
        { key: 'composicoes', label: 'Composições' },
      ] as { key: BaseDetailTab; label: string }[]).map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`whitespace-nowrap px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === t.key
              ? 'border-primary-700 text-primary-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
