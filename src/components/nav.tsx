'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import {
  Home, FolderKanban, Database, ScrollText, FileSpreadsheet, Package, Layers3, UploadCloud,
  ChevronLeft, ChevronRight, Building2,
} from 'lucide-react'
import { useActiveProject } from '@/lib/active-project-store'
import { Tooltip } from '@/components/ui/tooltip'
import { FsIcon } from '@/components/logo'

interface NavItemDef {
  href: string
  label: string
  icon: typeof Home
  active: boolean
}

function NavItem({ item, collapsed }: { item: NavItemDef; collapsed: boolean }) {
  const Icon = item.icon
  const link = (
    <Link
      href={item.href as any}
      className={`flex items-center rounded-md text-sm font-medium transition-colors ${
        collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2'
      } ${item.active ? 'bg-primary-700 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
    >
      <Icon size={17} strokeWidth={1.75} className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
  return collapsed ? <Tooltip label={item.label}>{link}</Tooltip> : link
}

function SubNavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href as any}
      className={`block rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? 'font-semibold text-white' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </Link>
  )
}

function GroupLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="mt-4 first:mt-0 h-px bg-white/10 mx-2" />
  return (
    <p className="mt-4 first:mt-0 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </p>
  )
}

export function Nav({ open = true, onToggle }: { open?: boolean; onToggle?: () => void }) {
  const pathname = usePathname()
  const activeProject = useActiveProject()
  const collapsed = !open

  const emBasesDeDados = pathname.startsWith('/bases') || pathname.startsWith('/insumos') || pathname.startsWith('/composicoes')

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-full flex-col bg-primary-950 transition-[width] duration-200"
      style={{ width: collapsed ? 64 : 288 }}
    >
      {/* Logo */}
      <div className={`flex items-center justify-between gap-2 border-b border-white/10 px-3 py-3 ${collapsed ? 'flex-col' : ''}`}>
        {collapsed ? (
          <Link href="/dashboard" className="flex h-9 w-9 items-center justify-center rounded-lg bg-white">
            <FsIcon size={20} />
          </Link>
        ) : (
          <Link href="/dashboard" className="min-w-0 flex-1">
            <div className="rounded-lg bg-white px-3 py-2">
              <Image src="/logofs.jpg" alt="fsconsultores" width={200} height={62} className="h-10 w-full object-contain object-center" priority />
            </div>
          </Link>
        )}
        {onToggle && (
          <button
            onClick={onToggle}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className="rounded p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        )}
      </div>

      {/* Projeto ativo */}
      {activeProject && (
        collapsed ? (
          <div className="border-b border-white/10 px-2 py-3">
            <Tooltip label={activeProject.nome_obra}>
              <Link href={`/orcamentos/${activeProject.id}` as any} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-primary-200 hover:bg-white/15">
                <Building2 size={16} />
              </Link>
            </Tooltip>
          </div>
        ) : (
          <Link
            href={`/orcamentos/${activeProject.id}` as any}
            className="block border-b border-white/10 px-3 py-3 transition-colors hover:bg-white/5"
          >
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary-300">
              <Building2 size={11} /> Projeto ativo
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-white" title={activeProject.nome_obra}>
              {activeProject.nome_obra}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
              {activeProject.codigo && (
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] text-slate-300">{activeProject.codigo}</span>
              )}
              {activeProject.cliente && <span className="truncate">{activeProject.cliente}</span>}
            </div>
          </Link>
        )
      )}

      {/* Menu */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        <NavItem item={{ href: '/dashboard', label: 'Início', icon: Home, active: pathname === '/dashboard' }} collapsed={collapsed} />

        <GroupLabel collapsed={collapsed}>Projetos</GroupLabel>
        <NavItem item={{ href: '/orcamentos', label: 'Orçamentos', icon: FolderKanban, active: pathname.startsWith('/orcamentos') }} collapsed={collapsed} />

        {activeProject && !collapsed && (
          <div className="ml-3 space-y-0.5 border-l border-primary-700/40 pl-3 pt-0.5">
            {[
              { suffix: 'planilha', label: 'Planilha', icon: FileSpreadsheet },
              { suffix: 'insumos', label: 'Insumos', icon: Package },
              { suffix: 'composicoes', label: 'Composições', icon: Layers3 },
              { suffix: 'importar', label: 'Importar', icon: UploadCloud },
            ].map(({ suffix, label }) => (
              <SubNavLink
                key={suffix}
                href={`/orcamentos/${activeProject.id}/${suffix}`}
                active={pathname.startsWith(`/orcamentos/${activeProject.id}/${suffix}`)}
              >
                {label}
              </SubNavLink>
            ))}
          </div>
        )}

        <GroupLabel collapsed={collapsed}>Dados</GroupLabel>
        <NavItem item={{ href: '/bases', label: 'Bases de Dados', icon: Database, active: emBasesDeDados }} collapsed={collapsed} />

        {emBasesDeDados && !collapsed && (
          <div className="ml-3 space-y-0.5 border-l border-primary-700/40 pl-3 pt-0.5">
            {[
              { href: '/insumos', label: 'Insumos' },
              { href: '/composicoes', label: 'Composições' },
            ].map(({ href, label }) => (
              <SubNavLink key={href} href={href} active={pathname.startsWith(href)}>{label}</SubNavLink>
            ))}
          </div>
        )}

        <GroupLabel collapsed={collapsed}>Sistema</GroupLabel>
        <NavItem item={{ href: '/logs', label: 'Logs do Sistema', icon: ScrollText, active: pathname.startsWith('/logs') }} collapsed={collapsed} />
      </nav>
    </aside>
  )
}
