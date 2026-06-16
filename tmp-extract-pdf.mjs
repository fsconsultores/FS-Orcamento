import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import fs from 'fs'

const CODIGO = process.argv[2] || 'ZZ849236'
const data = new Uint8Array(fs.readFileSync('tmp-caderno.pdf'))
const doc = await getDocument({ data }).promise
console.log('Total paginas:', doc.numPages)

for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const content = await page.getTextContent()
  const text = content.items.map(it => it.str).join(' ')
  if (text.includes(CODIGO) || text.includes('PLANILHA ANAL') || text.includes('Planilha Anal')) {
    console.log(`\n=== Pagina ${i} ===`)
    console.log(text.slice(0, 4000))
  }
}
