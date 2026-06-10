'use client'

import { useState } from 'react'
import { fmt } from '@/lib/curva-abc'
import type { CadernoData, CadernoNode } from '@/lib/orcamento/caderno'

function countItens(nodes: CadernoNode[]): number {
  let itens = 0
  for (const n of nodes) {
    if (n.tipo === 'item') itens++
    itens += countItens(n.filhos)
  }
  return itens
}

export function CadernoView({ data }: { data: CadernoData }) {
  const [exportando, setExportando] = useState(false)
  const itens = countItens(data.arvore)
  const totalInsumos = data.listaInsumos.reduce((s, g) => s + g.items.length, 0)

  async function handleExport() {
    setExportando(true)
    try {
      const { exportCadernoPdf } = await import('./export-caderno-pdf')
      await exportCadernoPdf(data)
    } finally {
      setExportando(false)
    }
  }

  const sections = [
    { title: 'Planilha de Preços Unitários', desc: `${itens} item(ns) na planilha orçamentária`, ok: itens > 0 },
    { title: 'Curva ABC — Insumos', desc: `${data.abcInsumos.length} insumo(s) classificado(s)`, ok: data.abcInsumos.length > 0 },
    { title: 'Curva ABC — Serviços', desc: `${data.abcServicos.length} serviço(s) classificado(s)`, ok: data.abcServicos.length > 0 },
    { title: 'Planilha Analítica', desc: `${data.composicoesAnaliticas.length} composição(ões) detalhada(s)`, ok: data.composicoesAnaliticas.length > 0 },
    { title: 'Lista de Insumos', desc: `${totalInsumos} insumo(s) em ${data.listaInsumos.length} categoria(s)`, ok: totalInsumos > 0 },
    { title: 'Anexos', desc: 'Seção vazia (sem dados disponíveis no software)', ok: false },
    { title: 'Cotações', desc: 'Seção vazia (sem dados disponíveis no software)', ok: false },
  ]

  const podeExportar = itens > 0 || data.abcInsumos.length > 0 || data.abcServicos.length > 0

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{data.orcamento.nome_obra || 'Sem nome'}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {[data.orcamento.codigo, data.orcamento.cliente].filter(Boolean).join(' • ') || '—'}
          </p>
          <p className="text-sm text-gray-700 mt-2">
            Total Geral: <span className="font-semibold">{fmt(data.totalGeral)}</span>
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exportando || !podeExportar}
          className="flex items-center gap-2 rounded-md bg-[#442246] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#5a2d5e] disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {exportando ? 'Gerando PDF…' : 'Gerar Caderno PDF'}
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Seções do caderno</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Apenas as seções com dados cadastrados são preenchidas; as demais entram como divisórias em branco.
          </p>
        </div>
        <ul className="divide-y divide-gray-100">
          {sections.map(s => (
            <li key={s.title} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-sm font-medium text-gray-900">{s.title}</p>
                <p className="text-xs text-gray-500">{s.desc}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${s.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                {s.ok ? 'Preenchida' : 'Vazia'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
