/**
 * Tokens de marca — única fonte de verdade pros hex usados fora do Tailwind
 * (ex.: geração de PDF via jsPDF, que desenha em canvas/raw e não tem acesso
 * às classes utilitárias). `purple`/`blue` espelham exatamente
 * `tailwind.config.ts` (`primary.700` e `secondary.500`, os stops-âncora da
 * identidade 2026) — qualquer mudança de marca deve atualizar os dois
 * lugares juntos. `violet`/`indigo` são variações da mesma rampa (primary
 * 500 / secondary 700), usadas quando um segundo/terceiro acento
 * relacionado é necessário (ex.: KPI cards que precisam se distinguir entre
 * si sem sair da família de cores da marca).
 */
export const brandPrimary = {
  purple: '#52276E',
  blue: '#344DA1',
  violet: '#833eb1',
  indigo: '#243670',
} as const

/**
 * Tons neutros/de acento complementares — não são "marca" no sentido de
 * identidade visual, mas vivem aqui pra manter um único arquivo como fonte
 * de verdade de cor pra tudo que a geração de PDF consome. `amber` é o
 * mesmo tom já usado pra Classe B (ABC) e destaque de item estimado em todo
 * o Caderno.
 */
export const brandSecondary = {
  silver: '#94a3b8',
  charcoal: '#1e293b',
  cyan: '#0891b2',
  amber: '#b45309',
} as const
