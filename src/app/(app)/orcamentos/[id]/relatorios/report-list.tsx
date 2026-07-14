'use client'

import { Search } from 'lucide-react'
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
  const totalReports = REPORT_CATALOG.reduce((acc, cat) => acc + cat.reports.length, 0)
  const totalFiltrados = REPORT_CATALOG.reduce((acc, cat) => {
    const filtered = q ? cat.reports.filter(r => normalize(r.title).includes(q) || normalize(r.shortDescription).includes(q)) : cat.reports
    return acc + filtered.length
  }, 0)

  return (
    <div className="w-full md:w-[300px] shrink-0 flex flex-col gap-4">
      <div>
        <p className="px-0.5 text-xs text-gray-400">{totalReports} relatório(s) disponível(is)</p>
      </div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Pesquisar relatório..."
          className="w-full rounded-md border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
        />
      </div>

      {totalFiltrados === 0 ? (
        <p className="px-2 text-sm text-gray-400">Nenhum relatório encontrado para &quot;{search}&quot;.</p>
      ) : (
        <div className="space-y-5">
          {REPORT_CATALOG.map(cat => {
            const filtered = q
              ? cat.reports.filter(r => normalize(r.title).includes(q) || normalize(r.shortDescription).includes(q))
              : cat.reports
            if (q && filtered.length === 0) return null

            return (
              <div key={cat.id}>
                <div className="flex items-center gap-2 px-2 mb-1.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 [&_svg]:h-3.5 [&_svg]:w-3.5">
                    {cat.icon}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{cat.label}</span>
                  <span className="text-xs text-gray-300">({cat.reports.length})</span>
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
                            selectedId === r.id ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          <span className={selectedId === r.id ? 'text-primary-700' : 'text-gray-400'}>{r.icon}</span>
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
      )}
    </div>
  )
}
