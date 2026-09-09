'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GitBranchPlus, ArrowRight } from 'lucide-react'
import type { RevisaoResumo } from '@/lib/orcamento/revisoes'
import { criarRevisaoAction } from './versoes-action'
import { ComparacaoPrecos } from './comparacao-precos'
import { PageHeader } from '@/components/ui/toolbar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

function fmtData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function VersoesView({
  orcamentoId,
  orcamentoNome,
  revisoesIniciais,
  revisoesFetchError,
}: {
  orcamentoId: string
  orcamentoNome: string
  revisoesIniciais: RevisaoResumo[]
  revisoesFetchError?: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const toast = useToast()
  const [criandoRevisao, setCriandoRevisao] = useState(false)

  async function handleCriarRevisao() {
    if (criandoRevisao) return
    setCriandoRevisao(true)
    try {
      const resultado = await criarRevisaoAction(orcamentoId)
      toast.show(`Revisão ${resultado.numero_revisao} criada.`)
      startTransition(() => {
        router.push(`/orcamentos/${resultado.id}/planilha`)
        router.refresh()
      })
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'Não foi possível criar a revisão. Tente novamente.', 'error')
      setCriandoRevisao(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Revisões"
        description={`${orcamentoNome} — cada revisão é uma cópia completa e independente. Editar uma nunca afeta as outras.`}
        actions={
          <Button onClick={handleCriarRevisao} loading={criandoRevisao} disabled={!!revisoesFetchError} icon={<GitBranchPlus size={15} />}>
            Nova revisão
          </Button>
        }
      />

      {revisoesFetchError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-700">Não foi possível carregar as revisões</p>
          <p className="mt-1 font-mono text-xs text-red-500">{revisoesFetchError}</p>
          <p className="mt-2 text-xs text-red-600">
            A migração <code className="mx-1 font-mono">20260828000000_orcamento_revisoes.sql</code>
            ainda não foi aplicada neste banco Supabase — rode-a no SQL Editor do projeto.
          </p>
        </div>
      )}

      {!revisoesFetchError && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="space-y-2">
            {revisoesIniciais.map(r => {
              const ehAqui = r.id === orcamentoId
              return (
                <div
                  key={r.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
                    ehAqui ? 'border-primary-300 bg-primary-50' : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      ehAqui ? 'bg-primary-700 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {r.numero_revisao}
                    </span>
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium text-gray-900">
                        Revisão {r.numero_revisao}
                        {ehAqui && <Badge variant="brand">você está aqui</Badge>}
                        {r.ehAtual && !ehAqui && <Badge variant="success">mais recente</Badge>}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
                        <span className="tabular-nums" suppressHydrationWarning>{fmtData(r.criado_em)}</span>
                        <span>·</span>
                        <span>{r.autor_email ?? 'autor desconhecido'}</span>
                        {r.ultimo_acesso && (
                          <>
                            <span>·</span>
                            <span>último acesso <span className="tabular-nums" suppressHydrationWarning>{fmtData(r.ultimo_acesso)}</span></span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  {ehAqui ? (
                    <span className="text-xs font-medium text-primary-700">Revisão aberta</span>
                  ) : (
                    <Link href={`/orcamentos/${r.id}/planilha`}>
                      <Button variant="outline" size="sm" icon={<ArrowRight size={13} />}>Abrir</Button>
                    </Link>
                  )}
                </div>
              )
            })}
            {revisoesIniciais.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-gray-400">Nenhuma revisão encontrada.</p>
            )}
          </div>
        </div>
      )}

      {!revisoesFetchError && revisoesIniciais.length > 1 && (
        <ComparacaoPrecos orcamentoId={orcamentoId} />
      )}
    </div>
  )
}
