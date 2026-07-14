/** Ícones dos widgets do dashboard — Lucide, tamanho/traço padronizados (ver design system). */
import { Building2, Wallet, Clock, GitCommitHorizontal, Activity, BarChart3, Plus, Database } from 'lucide-react'

const ICON_PROPS = { size: 16, strokeWidth: 1.75 } as const

export function IconBuilding() { return <Building2 {...ICON_PROPS} /> }
export function IconWallet() { return <Wallet {...ICON_PROPS} /> }
export function IconClock() { return <Clock {...ICON_PROPS} /> }
export function IconCommit() { return <GitCommitHorizontal {...ICON_PROPS} /> }
export function IconPulse() { return <Activity {...ICON_PROPS} /> }
export function IconBars() { return <BarChart3 {...ICON_PROPS} /> }
export function IconPlus() { return <Plus size={16} strokeWidth={2} /> }
export function IconDatabase() { return <Database {...ICON_PROPS} /> }
