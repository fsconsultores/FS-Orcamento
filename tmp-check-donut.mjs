import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
await supabase.auth.signInWithPassword({ email: process.env.TEST_EMAIL, password: process.env.TEST_PASSWORD })

const orcamentoId = '61ffa8f0-4dfa-423c-a8d8-3590b3710aac'

const { getCadernoData } = await import('./src/lib/orcamento/caderno.ts')
const data = await getCadernoData(supabase, orcamentoId)

const segments = data.arvore.filter(n => n.total > 0)
console.log(`Total de segmentos (grupos nivel 1 com total>0): ${segments.length}`)
const totalGeral = segments.reduce((s, n) => s + n.total, 0)
for (const n of segments) {
  console.log(`  ${n.numero ?? '—'} | ${n.descricao} | ${(n.total/totalGeral*100).toFixed(2)}%`)
}
