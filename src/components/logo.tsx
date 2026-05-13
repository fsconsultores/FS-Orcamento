export function FsIcon({ size = 28, color = '#3D4EE8' }: { size?: number; color?: string }) {
  const h = Math.round(size * 0.75)
  return (
    <svg width={size} height={h} viewBox="0 0 32 24" fill="none" aria-hidden="true">
      <path d="M0 4 L11 0.5 L11 23.5 L0 20 Z" fill={color} opacity="0.8" />
      <rect x="10" y="0"  width="3" height="24" rx="0.5" fill={color} />
      <rect x="15" y="2"  width="3" height="20" rx="0.5" fill={color} />
      <rect x="20" y="4"  width="3" height="16" rx="0.5" fill={color} />
      <rect x="25" y="6"  width="3" height="12" rx="0.5" fill={color} />
      <rect x="30" y="8"  width="2" height="8"  rx="0.5" fill={color} />
    </svg>
  )
}

export function FsLogo({
  size = 28,
  color = '#3D4EE8',
  textColor,
}: {
  size?: number
  color?: string
  textColor?: string
}) {
  const tc = textColor ?? color
  return (
    <span className="flex items-center gap-2 select-none">
      <FsIcon size={size} color={color} />
      <span
        style={{ color: tc, fontSize: Math.round(size * 0.6), fontWeight: 700, letterSpacing: '-0.01em' }}
      >
        fsconsultores
      </span>
    </span>
  )
}
