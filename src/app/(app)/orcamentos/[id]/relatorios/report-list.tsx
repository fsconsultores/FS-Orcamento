'use client'

import { REPORT_CATALOG } from './report-catalog'

interface Props {
  selectedId: string
  onSelect: (id: string) => void
  search: string
  onSearchChange: (v: string) => void
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function ReportList({ selectedId, onSelect, search, onSearchChange }: Props) {
  const q = normalize(search.trim())

  return (
    <div className="w-full md:w-[300px] shrink-0 flex flex-col gap-5">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Pesquisar relatório..."
          className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
        />
      </div>

      <div className="space-y-5">
        {REPORT_CATALOG.map(cat => {
          const filtered = q
            ? cat.reports.filter(r => normalize(r.title).includes(q) || normalize(r.shortDescription).includes(q))
            : cat.reports
          if (q && filtered.length === 0) return null

          return (
            <div key={cat.id}>
              <div className="flex items-center gap-2 px-2 mb-1.5 text-gray-400">
                {cat.icon}
                <span className="text-xs font-semibold uppercase tracking-wide">{cat.label}</span>
              </div>
              {filtered.length === 0 ? (
                <p className="px-2 text-xs text-gray-400 italic">Nenhum relatório disponível ainda.</p>
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map(r => (
                    <li key={r.id}>
                      <button
                        onClick={() => onSelect(r.id)}
                        className={`w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
                          selectedId === r.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className={selectedId === r.id ? 'text-blue-600' : 'text-gray-400'}>{r.icon}</span>
                        <span className="truncate">{r.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
