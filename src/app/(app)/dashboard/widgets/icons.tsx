/** Ícones de linha usados só nos cabeçalhos dos widgets do dashboard — sem dependência externa. */

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
      {children}
    </svg>
  )
}

export function IconBuilding() {
  return (
    <Svg>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V5a1 1 0 011-1h6a1 1 0 011 1v16M4 21h16M12 21v-6a1 1 0 011-1h4a1 1 0 011 1v6M7 7h1M7 11h1M7 15h1M10 7h1M10 11h1M10 15h1" />
    </Svg>
  )
}

export function IconWallet() {
  return (
    <Svg>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h13a1 1 0 011 1v2M3 7v10a2 2 0 002 2h14a2 2 0 002-2v-8a1 1 0 00-1-1H6a2 2 0 00-2-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 14h.01" />
    </Svg>
  )
}

export function IconClock() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="8.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5V12l3 2" />
    </Svg>
  )
}

export function IconCommit() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path strokeLinecap="round" d="M2 12h6M16 12h6" />
    </Svg>
  )
}

export function IconPulse() {
  return (
    <Svg>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12h4l2-6 4 12 2-8 1.5 2H21.5" />
    </Svg>
  )
}

export function IconBars() {
  return (
    <Svg>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Svg>
  )
}

export function IconPlus() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
    </svg>
  )
}
