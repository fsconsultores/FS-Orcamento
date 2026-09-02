/**
 * Tokens de marca — única fonte de verdade pros hex usados fora do Tailwind
 * (ex.: geração de PDF via jsPDF, que desenha em canvas/raw e não tem acesso
 * às classes utilitárias). Valores exatos do manual de marca FS Consultores
 * ("Papelaria 2021") — as 4 cores principais da identidade. `purple`/`blue`
 * espelham exatamente `tailwind.config.ts` (`primary.700` e `secondary.500`)
 * — qualquer mudança de marca deve atualizar os dois lugares juntos.
 * `violet`/`indigo` são as outras 2 cores principais do manual (tons usados
 * no degradê das barras do ícone e no wordmark), expostas também como
 * `accent.violet`/`accent.indigo` no Tailwind config.
 */
export const brandPrimary = {
  purple: '#51286E',
  blue: '#354DA1',
  violet: '#6C3893',
  indigo: '#312A6F',
} as const

/**
 * As 4 cores secundárias do manual de marca. Não são "marca" no sentido de
 * identidade visual primária, mas vivem aqui pra manter um único arquivo
 * como fonte de verdade de cor pra tudo que a geração de PDF consome.
 * `amber`/`cyan` também expostos no Tailwind como `accent.amber`/`accent.cyan`;
 * `charcoal`/`silver` como `ink`/`silver`.
 */
export const brandSecondary = {
  silver: '#BCBEC0',
  charcoal: '#231F20',
  cyan: '#44C8F5',
  amber: '#FAA61A',
} as const
