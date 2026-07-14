'use client'

import { useSyncExternalStore } from 'react'

// Store externo simples (useSyncExternalStore) para o projeto ativo aparecer na
// Sidebar. A Sidebar é renderizada uma única vez em SidebarShell, fora da árvore
// de `orcamentos/[id]/layout.tsx` — Context não alcançaria de um lado para o
// outro. `orcamentos/[id]/layout.tsx` já busca esses dados no servidor; um
// componente cliente (`SyncActiveProject`) só empurra o valor pra cá, eliminando
// o fetch client-side redundante que existia antes em `nav.tsx`.

export interface ActiveProject {
  id: string
  nome_obra: string
  codigo: string | null
  cliente: string | null
}

type Listener = () => void

let current: ActiveProject | null = null
const listeners = new Set<Listener>()

export function setActiveProject(project: ActiveProject | null) {
  current = project
  listeners.forEach(l => l())
}

export function subscribeActiveProject(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getActiveProject() {
  return current
}

export function useActiveProject(): ActiveProject | null {
  return useSyncExternalStore(subscribeActiveProject, getActiveProject, () => null)
}
