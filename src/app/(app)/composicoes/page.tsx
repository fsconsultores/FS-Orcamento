import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SearchInput } from '@/components/search-input';
import { ComposicoesTable } from './composicoes-table';

type ComposicaoView = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  custo_unitario: number;
};

export default async function ComposicoesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const sb = (await createClient()) as any;

  let query = sb
    .from('vw_custo_composicao')
    .select('id, codigo, descricao, unidade, custo_unitario')
    .order('codigo');

  if (q) {
    query = query.or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`);
  }

  const raw = await query;
  if (raw.error) throw raw.error;
  const composicoes = (raw.data ?? []) as ComposicaoView[];

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

      <Suspense>
        <SearchInput placeholder="Buscar por código ou descrição..." />
      </Suspense>

      <ComposicoesTable initialComposicoes={composicoes} />
    </div>
  );
}
