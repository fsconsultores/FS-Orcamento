'use client'

import { useEffect } from 'react'
import { setActiveProject, type ActiveProject } from '@/lib/active-project-store'

export function SyncActiveProject({ project }: { project: ActiveProject }) {
  useEffect(() => {
    setActiveProject(project)
    return () => setActiveProject(null)
  }, [project.id, project.nome_obra, project.codigo, project.cliente])

  return null
}
