// Remove marcas diacríticas (acentos) após decompor em NFD — cada caractere
// acentuado comum do português (á, é, ç, ã, ...) decompõe em exatamente
// 1 base + 1 marca, então o texto resultante mantém o mesmo comprimento e os
// mesmos índices do texto original (importante pra quem precisa mapear a
// posição de um match de volta pro texto acentuado, ex.: HighlightMatch).
// Faixa "Combining Diacritical Marks" (U+0300-U+036F) construída via
// charCode pra não depender de caracteres literais no arquivo-fonte.
const DIACRITICS_RE = new RegExp(
  '[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']',
  'g'
)

/** Remove acentos preservando comprimento/posição de cada caractere — não
 * mexe em maiúscula, espaço ou trim. Base de normalizeText() e do
 * normalize() usado por HighlightMatch (que precisa da posição intacta). */
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS_RE, '')
}

/** minúsculo, sem acento, espaços colapsados/trimados — pra comparar ou
 * agrupar texto (categorias de insumo, buscas que não precisam de posição)
 * sem se importar com variação de escrita. Não preserva índice/comprimento
 * do texto original — para isso, use stripDiacritics() direto. */
export function normalizeText(s: string): string {
  return stripDiacritics(s).toLowerCase().trim().replace(/\s+/g, ' ')
}
