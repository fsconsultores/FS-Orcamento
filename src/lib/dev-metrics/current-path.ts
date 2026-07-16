import { headers } from 'next/headers'

/**
 * Pathname da requisição atual, disponível em qualquer Server
 * Component/Action via o header `x-pathname` que o middleware propaga (ver
 * src/middleware.ts). Só usado pela instrumentação dev-only — retorna null
 * fora de desenvolvimento sem sequer ler headers().
 */
export async function getCurrentPath(): Promise<string | null> {
  if (process.env.NODE_ENV !== 'development') return null
  try {
    return (await headers()).get('x-pathname')
  } catch {
    return null
  }
}
