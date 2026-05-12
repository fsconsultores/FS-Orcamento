'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Início' },
  { href: '/orcamentos', label: 'Orçamentos' },
  { href: '/logs', label: 'Logs do Sistema' },
];

const ORCAMENTO_SUB_ITEMS = [
  { suffix: 'insumos', label: 'Insumos' },
  { suffix: 'composicoes', label: 'Composições' },
  { suffix: 'importar', label: 'Importar SINAPI' },
];

function getOrcamentoId(pathname: string): string | null {
  const match = pathname.match(/^\/orcamentos\/([^/]+)/);
  if (!match) return null;
  const seg = match[1];
  if (seg === 'novo' || seg === 'editar') return null;
  return seg;
}

export function Nav({ userEmail, open = true, onToggle }: { userEmail: string; open?: boolean; onToggle?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const orcamentoId = getOrcamentoId(pathname);
  const [orcamentoNome, setOrcamentoNome] = useState<string | null>(null);

  useEffect(() => {
    if (!orcamentoId) { setOrcamentoNome(null); return; }
    const sb = createClient() as any;
    sb.from('tabela_orcamentos')
      .select('nome_obra')
      .eq('id', orcamentoId)
      .single()
      .then(({ data }: { data: { nome_obra: string } | null }) => {
        setOrcamentoNome(data?.nome_obra ?? null);
      });
  }, [orcamentoId]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className={`fixed left-0 top-0 h-full w-64 border-r bg-white flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      {/* Logo + botão fechar */}
      <div className="px-4 py-4 border-b flex items-center justify-between">
        <Link className="font-bold text-blue-600 text-lg" href="/dashboard">
          Orçamento FS
        </Link>
        {onToggle && (
          <button
            onClick={onToggle}
            title="Fechar menu"
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 px-4 py-4 overflow-y-auto space-y-0.5">
        {/* Início */}
        <Link
          href="/dashboard"
          className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            pathname === '/dashboard' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          Início
        </Link>

        {/* Orçamentos + sub-itens quando dentro de um orçamento */}
        <Link
          href="/orcamentos"
          className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            pathname.startsWith('/orcamentos') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          Orçamentos
        </Link>

        {orcamentoId && (
          <div className="ml-3 border-l-2 border-blue-100 pl-3 space-y-0.5">
            {orcamentoNome && (
              <Link
                href={`/orcamentos/${orcamentoId}` as any}
                title={orcamentoNome}
                className="block px-3 py-1.5 text-xs font-semibold text-blue-700 truncate"
              >
                {orcamentoNome}
              </Link>
            )}
            {ORCAMENTO_SUB_ITEMS.map(({ suffix, label }) => {
              const href = `/orcamentos/${orcamentoId}/${suffix}`;
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={suffix}
                  href={href as any}
                  className={`block rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </div>
        )}

        {/* Biblioteca */}
        <Link
          href="/bases"
          className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            pathname.startsWith('/bases') || pathname.startsWith('/insumos') || pathname.startsWith('/composicoes')
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          Bases de Dados
        </Link>

        {(pathname.startsWith('/bases') || pathname.startsWith('/insumos') || pathname.startsWith('/composicoes')) && (
          <div className="ml-3 border-l-2 border-blue-100 pl-3 space-y-0.5">
            {[
              { href: '/insumos', label: 'Insumos' },
              { href: '/composicoes', label: 'Composições' },
            ].map(({ href, label }) => (
              <Link key={href} href={href as any}
                className={`block rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname.startsWith(href) ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}>
                {label}
              </Link>
            ))}
          </div>
        )}

        {/* Logs */}
        <Link
          href="/logs"
          className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            pathname.startsWith('/logs') ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          Logs do Sistema
        </Link>
      </nav>

      {/* Footer user */}
      <div className="border-t p-4 space-y-2">
        {orcamentoNome && (
          <Link
            href={`/orcamentos/${orcamentoId}` as any}
            title={orcamentoNome}
            className="flex items-center gap-2 rounded-md bg-gray-50 px-3 py-2 hover:bg-blue-50 group"
          >
            <svg className="w-3.5 h-3.5 shrink-0 text-gray-400 group-hover:text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs text-gray-700 group-hover:text-blue-700 truncate">{orcamentoNome}</span>
          </Link>
        )}
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