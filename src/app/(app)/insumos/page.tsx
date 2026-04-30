import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { SearchInput } from '@/components/search-input';
import { InsumosTable } from './insumos-table';
import type { Insumo } from '@/lib/supabase/types';

export default async function InsumosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from('tabela_insumos').select('*').order('codigo');
  if (q) {
    query = query.or(`codigo.ilike.%${q}%,descricao.ilike.%${q}%`);
  }

  const { data: insumos, error } = await query;
  if (error) throw error;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insumos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Biblioteca de materiais e mão de obra
          </p>
        </div>
        <Link
          href="/insumos/novo"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Novo insumo
        </Link>
      </div>

      <Suspense>
        <SearchInput placeholder="Buscar por código ou descrição..." />
      </Suspense>

      <InsumosTable initialInsumos={(insumos ?? []) as Insumo[]} />
    </div>
  );
}
