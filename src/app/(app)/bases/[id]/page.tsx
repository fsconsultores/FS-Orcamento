import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ArrowLeft, Package, Layers3, UploadCloud } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { SearchInput } from '@/components/search-input'
import { Pagination } from '@/components/pagination'
import { PageHeader, Toolbar } from '@/components/ui/toolbar'
import { StatRow, StatCard } from '@/components/ui/stat-row'
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { formatDateOnly } from '@/lib/format-date'
import { baseLabelFromOrgao } from '@/components/base-labels'
import { formatCurrency } from '@/lib/costs'
import { BaseTabs } from './base-tabs'

const PAGE_SIZE = 100

type Tab = 'insumos' | 'composicoes'

/**
 * Conteúdo de uma base global — só visualização/busca (edição continua
 * pelas telas /insumos e /composicoes, que já suportam isso). Filtra
 * direto por base_id (mais preciso que o filtro por nome/órgão usado nessas
 * duas telas, que existe pra outro propósito: comparar entre bases).
 */
export default async function BaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; q?: string; page?: string }>
}) {
  const { id } = await params
  const { tab: tabParam, q, page: pageParam } = await searchParams
  const tab: Tab = tabParam === 'composicoes' ? 'composicoes' : 'insumos'
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()
  const sb = supabase as any

  const qs = new URLSearchParams()
  qs.set('tab', tab)
  if (q) qs.set('q', q)
  const baseHref = `/bases/${id}?${qs.toString()}`

  // As 4 consultas não dependem umas das outras (nem `base` é usado pelas
  // outras 3) — disparar tudo em paralelo evita empilhar 4 idas e vindas
  // sequenciais ao Supabase (~200-300ms cada) a cada clique de aba/busca,
  // que é o que fazia a navegação parecer travada. Sem busca (`q`), o total
  // da aba é sempre igual ao total geral da base (mesmo filtro, base_id) —
  // reaproveita totalInsumos/totalComposicoes em vez de pedir outro COUNT
  // exato ao Postgres pra chegar no mesmo número (5ª consulta desnecessária).
  let tabQuery = tab === 'insumos'
    ? sb.from('tabela_insumos').select('id, codigo, descricao, unidade, grupo, preco_base, data_referencia', q ? { count: 'exact' } : undefined).eq('base_id', id)
    : sb.from('vw_custo_composicao').select('id, codigo, descricao, unidade, custo_unitario, incompleta', q ? { count: 'exact' } : undefined).eq('base_id', id)
  if (q) tabQuery = tabQuery.or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`)
  tabQuery = tabQuery.order('codigo').range(from, to)

  const [{ data: base }, { count: totalInsumos }, { count: totalComposicoes }, { data: tabData, count: totalBusca, error }] = await Promise.all([
    sb.from('tabela_bases').select('id, nome, orgao, tipo_base').eq('id', id).single(),
    sb.from('tabela_insumos').select('id', { count: 'exact', head: true }).eq('base_id', id),
    sb.from('vw_custo_composicao').select('id', { count: 'exact', head: true }).eq('base_id', id),
    tabQuery,
  ])
  if (!base) notFound()
  if (error) throw error

  const total = q ? (totalBusca ?? 0) : (tab === 'insumos' ? (totalInsumos ?? 0) : (totalComposicoes ?? 0))
  const insumos: { id: string; codigo: string; descricao: string; unidade: string; grupo: string | null; preco_base: number; data_referencia: string | null }[] = tab === 'insumos' ? (tabData ?? []) : []
  const composicoes: { id: string; codigo: string; descricao: string; unidade: string; custo_unitario: number; incompleta?: boolean }[] = tab === 'composicoes' ? (tabData ?? []) : []

  // "própria" agora pode ser renomeada (ver /bases → lápis no nome) — usa o
  // orgao direto, sem o hardcode antigo "Minha Base" nem baseLabelFromOrgao
  // (que existe pra mapear siglas de bases oficiais conhecidas, não faz
  // sentido pra um nome livre digitado pelo usuário).
  const nomeExibicao = base.tipo_base === 'propria' ? base.orgao : baseLabelFromOrgao(base.orgao)

  return (
    <div className="space-y-6">
      <Link href="/bases" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft size={14} /> Voltar para Bases
      </Link>

      <PageHeader
        title={nomeExibicao}
        description="Conteúdo desta base — insumos e composições disponíveis para importar em qualquer orçamento."
        actions={
          <Link href={`/bases/${id}/importar` as any}>
            <Button variant="outline" icon={<UploadCloud size={15} />}>Importar mais dados</Button>
          </Link>
        }
      />

      <StatRow>
        <StatCard label="Insumos" value={(totalInsumos ?? 0).toLocaleString('pt-BR')} icon={<Package size={16} />} />
        <StatCard label="Composições" value={(totalComposicoes ?? 0).toLocaleString('pt-BR')} icon={<Layers3 size={16} />} />
      </StatRow>

      <BaseTabs id={id} tab={tab} q={q} />

      <Toolbar
        search={
          <Suspense>
            <SearchInput placeholder="Buscar por código ou descrição..." />
          </Suspense>
        }
      />

      {tab === 'insumos' ? (
        insumos.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <EmptyState icon={<Package size={20} />} title="Nenhum insumo encontrado" description={q ? 'Ajuste a busca.' : 'Esta base ainda não tem insumos importados.'} />
          </div>
        ) : (
          <Table>
            <Thead>
              <Th className="w-28">Código</Th>
              <Th>Descrição</Th>
              <Th className="w-36">Grupo</Th>
              <Th className="w-20">Unidade</Th>
              <Th className="w-36 text-right">Custo</Th>
              <Th className="w-28">Data ref.</Th>
            </Thead>
            <Tbody>
              {insumos.map(ins => (
                <Tr key={ins.id}>
                  <Td className="font-mono text-xs text-gray-500">{ins.codigo}</Td>
                  <Td className="text-gray-900">{ins.descricao}</Td>
                  <Td className="text-gray-600">{ins.grupo ?? '—'}</Td>
                  <Td className="text-gray-600">{ins.unidade}</Td>
                  <Td className="text-right font-medium tabular-nums text-gray-900">{formatCurrency(ins.preco_base)}</Td>
                  <Td className="text-gray-500">{formatDateOnly(ins.data_referencia)}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )
      ) : (
        composicoes.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <EmptyState icon={<Layers3 size={20} />} title="Nenhuma composição encontrada" description={q ? 'Ajuste a busca.' : 'Esta base ainda não tem composições importadas.'} />
          </div>
        ) : (
          <Table>
            <Thead>
              <Th className="w-28">Código</Th>
              <Th>Descrição</Th>
              <Th className="w-20">Unidade</Th>
              <Th className="w-36 text-right">Custo unit.</Th>
              <Th className="w-28">Status</Th>
            </Thead>
            <Tbody>
              {composicoes.map(c => (
                <Tr key={c.id}>
                  <Td className="font-mono text-xs text-gray-500">{c.codigo}</Td>
                  <Td className="text-gray-900">{c.descricao}</Td>
                  <Td className="text-gray-600">{c.unidade}</Td>
                  <Td className="text-right font-medium tabular-nums text-gray-900">{formatCurrency(c.custo_unitario)}</Td>
                  <Td>
                    {c.incompleta
                      ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Incompleta</span>
                      : <span className="text-xs text-gray-300">—</span>}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )
      )}

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} baseHref={baseHref} />
    </div>
  )
}
