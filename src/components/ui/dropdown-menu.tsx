'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { useClickOutside } from '@/lib/use-click-outside'

const DEFAULT_TRIGGER_CLS = 'flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 transition-colors shadow-sm'

/** Botão que abre um painel posicionado, fechando ao clicar fora — usado
 * para agrupar ações pouco frequentes atrás de 1 alvo em vez de espalhar
 * vários botões simultâneos na toolbar (lei de Hick). Mesma ideia visual do
 * painel "Ferramentas" da Planilha, generalizada pra outras telas. */
export function DropdownMenu({
  label, icon, disabled, triggerClassName, align = 'right', panelClassName = '', children,
}: {
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
  triggerClassName?: string
  align?: 'left' | 'right'
  panelClassName?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, () => setOpen(false), open)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        className={triggerClassName ?? DEFAULT_TRIGGER_CLS}
      >
        {icon}
        {label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          // w-80 (não mais w-72): o painel "Ajustar valor" mostra valores em
          // R$ que podem ser bem grandes (orçamentos de dezenas de milhões)
          // — com pouca folga eles ficavam espremidos contra o
          // overflow-hidden abaixo (que existe só pra arredondar os cantos
          // dos filhos, não pra recortar texto) e cortavam. max-w respeita
          // telas estreitas; o conteúdo (ex.: linhas flex-wrap) ainda decide
          // como se comportar dentro dessa largura.
          className={`absolute top-full mt-2 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'} ${panelClassName}`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** Cabeçalho de agrupamento dentro do painel (ex.: "Manutenção") — mesmo
 * idioma visual já usado no painel "Ferramentas" da Planilha. */
export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <p className="px-3 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">{children}</p>
}

/** Uma ação dentro do painel — ícone + título + descrição curta opcional. */
export function DropdownMenuItem({
  icon, label, description, onClick, disabled, tone = 'default',
}: {
  icon?: ReactNode
  label: ReactNode
  description?: ReactNode
  onClick?: () => void
  disabled?: boolean
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs transition-colors disabled:opacity-40 ${
        tone === 'danger' ? 'text-red-700 hover:bg-red-50' : 'text-gray-800 hover:bg-blue-50'
      }`}
    >
      {icon && <span className="w-4 h-4 shrink-0 mt-0.5">{icon}</span>}
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-[10px] font-normal leading-tight text-gray-400">{description}</span>}
      </span>
    </button>
  )
}
