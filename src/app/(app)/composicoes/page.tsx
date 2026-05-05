import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SearchInput } from '@/components/search-input';
import { BaseFilter } from '@/components/base-filter';
import {  baseLabelFromOrgao } from '@/components/base-labels';
import { ComposicoesTable } from './composicoes-table';

type ComposicaoView = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  base_id: string | null;
  orgao: string | null;
  tipo_base: string | null;
  custo_unitario: number;
};

export default async function ComposicoesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; orgao?: string }>;
}) {
  const { q, orgao } = await searchParams;
  const supabase = await createClient();
  const sb = supabase as any;

  // Bases disponíveis para o filtro
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

  let query = sb
    .from('vw_custo_composicao')
    .select('id, codigo, descricao, unidade, base_id, orgao, tipo_base, custo_unitario')
    .order('codigo');

  if (q) {
    query = query.or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`);
  }

  if (orgao === 'SEM_BASE') {
    query = query.is('base_id', null);
  } else if (baseIdFiltro) {
    query = query.eq('base_id', baseIdFiltro);
  }

  const raw = await query;
  if (raw.error) throw raw.error;
  const composicoes = (raw.data ?? []) as ComposicaoView[];

  const baseOptions = bases.map((b) => ({
    orgao: b.orgao,
    label: b.tipo_base === 'propria' ? 'Minha Base' : baseLabelFromOrgao(b.orgao),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Composições</h1>
          <p className="mt-1 text-sm text-gray-500">Biblioteca de serviços</p>
        </div>
        <Link
          href="/composicoes/nova"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Nova composição
        </Link>
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

      <ComposicoesTable initialComposicoes={composicoes} />
    </div>
  );
}
