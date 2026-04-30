import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ count: orcamentosCount }, { count: composicoesCount }, { count: insumosCount }] =
    await Promise.all([
      supabase.from('tabela_orcamentos').select('*', { count: 'exact', head: true }),
      supabase.from('tabela_composicoes').select('*', { count: 'exact', head: true }),
      supabase.from('tabela_insumos').select('*', { count: 'exact', head: true }),
    ]);

  const cards = [
    {
      label: 'Orçamentos',
      count: orcamentosCount ?? 0,
      href: '/orcamentos',
      action: 'Gerenciar orçamentos',
    },
    {
      label: 'Composições',
      count: composicoesCount ?? 0,
      href: '/composicoes',
      action: 'Ver biblioteca',
    },
    {
      label: 'Insumos',
      count: insumosCount ?? 0,
      href: '/insumos',
      action: 'Ver biblioteca',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bem-vindo, {user?.email?.split('@')[0]}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <div key={card.href} className="rounded-xl border bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-500">{card.label}</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{card.count}</p>
            <Link
              href={card.href}
              className="mt-4 inline-block text-sm text-blue-600 hover:underline"
            >
              {card.action} →
            </Link>
          </div>
        ))}
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-gray-900">Ações rápidas</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/orcamentos/novo"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Novo orçamento
          </Link>
          <Link
            href="/composicoes/nova"
            className="rounded-md border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Nova composição
          </Link>
        </div>
      </div>
    </div>
  );
}
