/**
 * Assets estáticos da marca FS Consultores para relatórios PDF. Mesmos PNGs
 * usados na UI (login, nav, exports) — ver public/logofs*.png. `WHITE` é a
 * versão branca (derivada de logofs.png preservando o alpha), usada quando o
 * fundo é escuro.
 */
export const BRAND_LOGO_PNG_PATH = '/logofs.png'
export const BRAND_LOGO_PNG_WHITE_PATH = '/logofs-white.png'

/** Proporção real de public/logofs.png (2156×617 px) — igual na versão branca. */
export const BRAND_LOGO_PNG_ASPECT = 617 / 2156

/**
 * Cache em memória do PNG branco da marca, em bytes — usado pelo Cabeçalho
 * Mestre (standard-header.ts), que é desenhado de forma SÍNCRONA dentro de
 * hooks do autoTable (didDrawPage) uma vez por página, então não pode fazer
 * seu próprio fetch/await. `preloadBrandLogoWhite()` é chamado uma única vez
 * no início da exportação do Caderno (exportCadernoPdf); todas as páginas
 * seguintes só leem o cache já pronto via `getBrandLogoWhiteBytes()`.
 * `undefined` = ainda não tentou carregar; `null` = tentou e falhou (fica
 * cacheado como falha pra não tentar de novo a cada página).
 */
let brandLogoWhiteBytes: Uint8Array | null | undefined

export async function preloadBrandLogoWhite(): Promise<void> {
  if (brandLogoWhiteBytes !== undefined) return
  try {
    const resp = await fetch(BRAND_LOGO_PNG_WHITE_PATH)
    brandLogoWhiteBytes = resp.ok ? new Uint8Array(await resp.arrayBuffer()) : null
  } catch {
    brandLogoWhiteBytes = null
  }
}

/** Bytes já carregados (ou null se preload não rodou/falhou) — sempre síncrono. */
export function getBrandLogoWhiteBytes(): Uint8Array | null {
  return brandLogoWhiteBytes ?? null
}
