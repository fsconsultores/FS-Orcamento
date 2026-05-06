'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Início' },
  { href: '/orcamentos', label: 'Orçamentos' },
  { href: '/logs', label: 'Logs do Sistema' },
];

const ORCAMENTO_SUB_ITEMS = [
  { suffix: 'insumos', label: 'Insumos' },
  { suffix: 'composicoes', label: 'Composições' },
  { suffix: 'importar', label: 'Importar Excel' },
];

function getOrcamentoId(pathname: string): string | null {
  const match = pathname.match(/^\/orcamentos\/([^/]+)/);
  if (!match) return null;
  const seg = match[1];
  if (seg === 'novo' || seg === 'editar') return null;
  return seg;
}

export function Nav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const orcamentoId = getOrcamentoId(pathname);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-64 border-r bg-white flex flex-col">
      {/* Logo */}
      <div className="px-6 py-4 border-b">
        <Link className="font-bold text-blue-600 text-lg" href="/dashboard">
          Orçamento FS
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-4 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href as any}
              className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {item.label}
            </Link>
          );
        })}

        {/* Sub-itens visíveis apenas dentro de /orcamentos/[id] */}
        {orcamentoId && (
          <div className="pt-1 ml-3 space-y-0.5 border-l-2 border-blue-100 pl-3">
            {ORCAMENTO_SUB_ITEMS.map(({ suffix, label }) => {
              const href = `/orcamentos/${orcamentoId}/${suffix}`;
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={suffix}
                  href={href as any}
                  className={`block rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        )}
      </nav>

      {/* Footer user */}
      <div className="border-t p-4 space-y-2">
        <div className="text-xs text-gray-500 truncate">
          {userEmail}
        </div>

        <button
          onClick={handleLogout}
          className="w-full rounded-md border px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}