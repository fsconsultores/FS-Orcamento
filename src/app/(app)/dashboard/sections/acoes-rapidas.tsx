import Link from 'next/link'
import { PlusCircle, UploadCloud, Database, Layers3, Package, FileBarChart } from 'lucide-react'

/**
 * `relatoriosHref` aponta para o orçamento acessado mais recentemente
 * (/orcamentos/{id}/relatorios) — Relatórios é sempre por-projeto, não existe
 * uma tela global. Sem orçamento nenhum, cai em /orcamentos.
 *
 * `importarBaseHref` vai direto para a importação da SINAPI (a atualização
 * mais comum, mensal) quando essa base já existe; sem ela, cai em /bases
 * (onde dá para escolher qualquer base e importar).
 */
export function AcoesRapidas({ relatoriosHref, importarBaseHref }: { relatoriosHref: string; importarBaseHref: string }) {
  const acoes = [
    { href: '/orcamentos/novo', label: 'Novo orçamento', icon: PlusCircle },
    { href: importarBaseHref, label: 'Importar base', icon: UploadCloud },
    { href: '/bases', label: 'Abrir base global', icon: Database },
    { href: '/composicoes', label: 'Gerenciar composições', icon: Layers3 },
    { href: '/insumos', label: 'Gerenciar insumos', icon: Package },
    { href: relatoriosHref, label: 'Relatórios', icon: FileBarChart },
  ] as const

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {acoes.map(({ href, label, icon: Icon }, idx) => (
        <Link
          key={`${href}-${idx}`}
          href={href as any}
          className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-4 text-center shadow-sm transition-colors hover:border-primary-300 hover:bg-primary-50"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Icon size={18} strokeWidth={1.75} />
          </span>
          <span className="text-xs font-medium text-gray-700">{label}</span>
        </Link>
      ))}
    </div>
  )
}
