'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Início' },
  { href: '/orcamentos', label: 'Orçamentos' },
  { href: '/composicoes', label: 'Composições' },
  { href: '/insumos', label: 'Insumos' },
  { href: '/logs', label: 'Logs do Sistema' },
];

export function Nav({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const router = useRouter();

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
        <Link className="font-bold text-blue-600 text-lg"
          href="/dashboard"
          >Orçamento FS
        </Link>
      </div>

      {/* Menu */}
      <nav className="flex-1 px-4 py-4 space-y-1">
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