/**
 * Factory A4 paisagem — única forma de instanciar jsPDF nos relatórios.
 */
import type { jsPDF } from 'jspdf'

export type LandscapeA4Pdf = jsPDF

export async function createLandscapeA4Pdf(): Promise<LandscapeA4Pdf> {
  const { jsPDF } = await import('jspdf')
  return new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
}

/** Adiciona página A4 paisagem mantendo o padrão do documento. */
export function addLandscapeA4Page(doc: jsPDF): void {
  doc.addPage('a4', 'landscape')
}
