'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Image from 'next/image';

function getOrcamentoId(pathname: string): string | null {
  const match = pathname.match(/^\/orcamentos\/([^/]+)/);
  if (!match) return null;
  const seg = match[1];
  if (seg === 'novo' || seg === 'editar') return null;
  return seg;
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href as any}
      className={`flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'text-slate-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
}

function SubNavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href as any}
      className={`block rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </Link>
  );
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
    <aside
      style={{ backgroundColor: '#1C0C1D' }}
      className={`fixed left-0 top-0 h-full w-72 flex flex-col transition-transform duration-300 z-40 ${open ? 'translate-x-0' : '-translate-x-full'}`}
    >
      {/* Logo */}
      <div className="px-3 py-3 border-b border-white/10 flex items-center justify-between gap-2">
        <Link href="/dashboard" className="flex-1 min-w-0">
          <div className="bg-white rounded-lg px-3 py-2">
            <Image src="/logofs.jpg" alt="fsconsultores" width={200} height={62} className="h-10 w-full object-contain object-center" priority />
          </div>
        </Link>
        {onToggle && (
          <button
            onClick={onToggle}
            title="Fechar menu"
            className="rounded p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-0.5">
        <NavLink href="/dashboard" active={pathname === '/dashboard'}>
          Início
        </NavLink>

        <NavLink href="/orcamentos" active={pathname.startsWith('/orcamentos')}>
          Orçamentos
        </NavLink>

        {orcamentoId && (
          <div className="ml-3 border-l border-blue-700/40 pl-3 space-y-0.5 pt-0.5">
            {orcamentoNome && (
              <Link
                href={`/orcamentos/${orcamentoId}` as any}
                title={orcamentoNome}
                className="block px-3 py-1 text-xs font-semibold text-slate-300 truncate hover:text-white transition-colors"
              >
                {orcamentoNome}
              </Link>
            )}
            {[
              { suffix: 'planilha',  label: 'Planilha' },
              { suffix: 'insumos',   label: 'Insumos' },
              { suffix: 'composicoes', label: 'Composições' },
              { suffix: 'importar',  label: 'Importar' },
            ].map(({ suffix, label }) => (
              <SubNavLink key={suffix} href={`/orcamentos/${orcamentoId}/${suffix}`} active={pathname.startsWith(`/orcamentos/${orcamentoId}/${suffix}`)}>
                {label}
              </SubNavLink>
            ))}
          </div>
        )}

        <NavLink
          href="/bases"
          active={pathname.startsWith('/bases') || pathname.startsWith('/insumos') || pathname.startsWith('/composicoes')}
        >
          Bases de Dados
        </NavLink>

        {(pathname.startsWith('/bases') || pathname.startsWith('/insumos') || pathname.startsWith('/composicoes')) && (
          <div className="ml-3 border-l border-blue-700/40 pl-3 space-y-0.5 pt-0.5">
            {[
              { href: '/insumos',    label: 'Insumos' },
              { href: '/composicoes', label: 'Composições' },
            ].map(({ href, label }) => (
              <SubNavLink key={href} href={href} active={pathname.startsWith(href)}>
                {label}
              </SubNavLink>
            ))}
          </div>
        )}

        <NavLink href="/logs" active={pathname.startsWith('/logs')}>
          Logs do Sistema
        </NavLink>
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-4 space-y-2">
        {orcamentoNome && (
          <Link
            href={`/orcamentos/${orcamentoId}` as any}
            title={orcamentoNome}
            className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-white/8 group transition-colors"
          >
            <svg className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs text-slate-300 group-hover:text-white truncate transition-colors">{orcamentoNome}</span>
          </Link>
        )}
        <div className="px-1 text-xs text-slate-400 truncate">{userEmail}</div>
        <button
          onClick={handleLogout}
          className="w-full rounded-md border border-white/20 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          Sair
        </button>
      </div>
    </aside>
  );
}
