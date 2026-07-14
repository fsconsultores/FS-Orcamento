import { Loader2 } from 'lucide-react'

export function Spinner({ className = '', size = 16 }: { className?: string; size?: number }) {
  return <Loader2 size={size} strokeWidth={2.25} className={`animate-spin ${className}`} />
}
