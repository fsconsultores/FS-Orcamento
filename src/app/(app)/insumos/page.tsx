import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SearchInput } from '@/components/search-input';
import { BaseFilter } from '@/components/base-filter';
import { baseLabelFromOrgao } from '@/components/base-labels';
import { InsumosTable } from './insumos-table';
import { ExportXlsxButton } from '@/components/export-xlsx-button';
import { Pagination } from '@/components/pagination';
import type { InsumoComBase } from '@/lib/supabase/types';

const PAGE_SIZE = 100;

export default async function InsumosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; orgao?: string; origem?: string; page?: string }>;
}) {
  const { q, orgao, origem, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const qs = new URLSearchParams()
  if (q) qs.set('q', q)
  if (orgao) qs.set('orgao', orgao)
  if (origem) qs.set('origem', origem)
  const baseHref = `/insumos${qs.toString() ? '?' + qs.toString() : ''}`

  const supabase = await createClient();
  const sb = supabase as any;

  const { data: basesRaw } = await sb
    .from('tabela_bases')
    .select('id, nome, orgao, tipo_base')
    .order('tipo_base')
    .order('orgao');
  const bases = (basesRaw ?? []) as { id: string; nome: string; orgao: string; tipo_base: string }[];

  let baseIdFiltro: string | null = null;
  if (orgao && orgao !== 'SEM_BASE') {
    const match = bases.find((b) => b.orgao === orgao);
    if (match) baseIdFiltro = match.id;
  }

  function addFilters(query: any) {
    if (q) query = query.or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`)
    if (orgao === 'SEM_BASE') query = query.is('base_id', null)
    else if (baseIdFiltro) query = query.eq('base_id', baseIdFiltro)
    if (origem) query = query.eq('base_origem', origem)
    return query
  }

  // count: fetch 1 row with count:exact (GET is more reliable than HEAD for Supabase)
  const countResult = await addFilters(
    sb.from('tabela_insumos').select('id', { count: 'exact' }).range(0, 0)
  )
  const total: number = countResult.count ?? 0

  // data page
  const { data: insumos, error } = await addFilters(
    sb
      .from('tabela_insumos')
      .select('id, codigo, descricao, grupo, unidade, preco_base, data_referencia, base_id, base_origem, tabela_bases(orgao, tipo_base)')
      .order('codigo')
      .range(from, to)
  )
  if (error) throw error;

  const baseOptions = bases.map((b) => ({
    orgao: b.orgao,
    label: b.tipo_base === 'propria' ? 'Minha Base' : baseLabelFromOrgao(b.orgao),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insumos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Biblioteca de materiais e mão de obra
            {total > 0 && <> · <span className="font-medium">{total.toLocaleString('pt-BR')}</span> itens</>}
          </p>
        </div>
        <div className="flex gap-2">
          <ExportXlsxButton
            rows={(insumos ?? []).map((ins: InsumoComBase) => ({
              'Código': ins.codigo,
              'Descrição': ins.descricao,
              'Grupo': ins.grupo ?? '',
              'Unidade': ins.unidade,
              'Custo': ins.preco_base,
              'Base': ins.base_origem ?? (ins.tabela_bases ? baseLabelFromOrgao(ins.tabela_bases.orgao) : ''),
              'Data Ref.': ins.data_referencia
                ? new Date(ins.data_referencia).toLocaleDateString('pt-BR')
                : '',
            }))}
            sheetName="Insumos"
            fileName="insumos.xlsx"
          />
          <Link
            href="/insumos/novo"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Novo insumo
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <Suspense>
          <SearchInput placeholder="Buscar por código ou descrição..." />
        </Suspense>
        {baseOptions.length > 0 && (
          <Suspense>
            <BaseFilter bases={baseOptions} />
          </Suspense>
        )}
      </div>

      <InsumosTable key={`${page}-${q}-${orgao}-${origem}`} initialInsumos={(insumos ?? []) as InsumoComBase[]} />

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} baseHref={baseHref} />
    </div>
  );
}
