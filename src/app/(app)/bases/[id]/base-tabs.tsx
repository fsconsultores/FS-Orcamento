type Tab = 'insumos' | 'composicoes'

/**
 * <a> nativo, não next/link — testado e descartado: com <Link> (tanto
 * router.push+startTransition quanto Link puro com/sem prefetch), o clique
 * às vezes trava por 15-20s antes de se recuperar sozinho. Reproduzido até
 * na paginação de /insumos (recurso já existente, não introduzido aqui) —
 * é um bug sistêmico do router client-side do Next nesta versão/config
 * (staleTimes em next.config.ts), não específico desta tela. <a> nativo
 * força reload completo, sem passar pelo router client-side: mais lento
 * que uma navegação soft bem-sucedida (~700-900ms medido em produção), mas
 * sempre confiável, e o navegador já mostra feedback de carregamento sozinho.
 */
export function BaseTabs({ id, tab, q }: { id: string; tab: Tab; q?: string }) {
  function hrefFor(t: Tab) {
    const qs = new URLSearchParams()
    qs.set('tab', t)
    if (q) qs.set('q', q)
    return `/bases/${id}?${qs.toString()}`
  }

  return (
    <div className="flex gap-0 border-b border-gray-200">
      {([
        { key: 'insumos', label: 'Insumos' },
        { key: 'composicoes', label: 'Composições' },
      ] as { key: Tab; label: string }[]).map(t => (
        <a
          key={t.key}
          href={hrefFor(t.key)}
          className={`whitespace-nowrap px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === t.key
              ? 'border-primary-700 text-primary-700'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          {t.label}
        </a>
      ))}
    </div>
  )
}
