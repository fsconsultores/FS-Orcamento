'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { Trash2, Database, Building2, UploadCloud, RefreshCw } from 'lucide-react'
import { createBase, deleteBase, preencherPrecos } from './actions'
import { Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button, IconButton } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ConfirmDialog } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'

type Base = {
  id: string
  nome: string
  orgao: string
  tipo_base: string
  total_insumos: number
  total_composicoes: number
}

type PreencherState = { baseId: string; referenciaId: string; loading: boolean; resultado: string | null }

export function BasesView({ bases: initialBases }: { bases: Base[] }) {
  const toast = useToast()
  const [bases, setBases] = useState(initialBases)
  const [novoNome, setNovoNome] = useState('')
  const [creating, setCreating] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Base | null>(null)
  const [isPending, startTransition] = useTransition()
  const [preencher, setPreencher] = useState<PreencherState | null>(null)

  const basesProprias = bases.filter(b => b.tipo_base === 'propria')
  const basesExternas = bases.filter(b => b.tipo_base !== 'propria')

  async function handlePreencher(e: React.FormEvent) {
    e.preventDefault()
    if (!preencher || !preencher.referenciaId) return
    setPreencher(prev => prev ? { ...prev, loading: true, resultado: null } : null)
    const result = await preencherPrecos(preencher.baseId, preencher.referenciaId)
    if (result.error) {
      setPreencher(prev => prev ? { ...prev, loading: false, resultado: `Erro: ${result.error}` } : null)
    } else {
      setPreencher(prev => prev ? {
        ...prev, loading: false,
        resultado: `${result.atualizados.toLocaleString('pt-BR')} preços preenchidos${result.naoEncontrados > 0 ? ` · ${result.naoEncontrados.toLocaleString('pt-BR')} não encontrados` : ''}.`
      } : null)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!novoNome.trim()) return
    setCreating(true)
    setErro(null)
    const result = await createBase(novoNome)
    if ('error' in result) {
      setErro(result.error)
    } else {
      setBases(prev => [...prev, {
        id: result.id,
        nome: novoNome.trim(),
        orgao: novoNome.trim(),
        tipo_base: 'externa',
        total_insumos: 0,
        total_composicoes: 0,
      }])
      setNovoNome('')
    }
    setCreating(false)
  }

  async function handleDelete() {
    if (!confirmDelete) return
    const base = confirmDelete
    setConfirmDelete(null)
    setDeletingId(base.id)
    const result = await deleteBase(base.id)
    if (result.error) {
      toast.show(`Não foi possível excluir a base: ${result.error}`, 'error')
    } else {
      setBases(prev => prev.filter(b => b.id !== base.id))
      toast.show('Base excluída.')
    }
    setDeletingId(null)
  }

  return (
    <div className="space-y-6">
      {/* Nova base */}
      <form onSubmit={handleCreate} className="flex items-end gap-3">
        <div className="flex-1 max-w-sm">
          <Input
            label="Nova base"
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            placeholder="Ex: SINAPI OUT 2025, SUDECAP 2024..."
            error={erro ?? undefined}
          />
        </div>
        <Button type="submit" disabled={!novoNome.trim()} loading={creating}>
          Criar base
        </Button>
      </form>

      {/* Base própria da empresa — destaque, existe uma só por conta */}
      {basesProprias.map(base => (
        <div key={base.id} className="rounded-xl border border-primary-200 bg-primary-50/40 shadow-sm">
          <div className="flex flex-wrap items-center gap-4 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary-700 text-white">
              <Building2 size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-700">Base própria da empresa</p>
              <p className="mt-0.5 truncate text-base font-semibold text-gray-900">{base.orgao}</p>
              <p className="mt-0.5 text-sm text-gray-500">
                {base.total_insumos.toLocaleString('pt-BR')} insumo(s) · {base.total_composicoes.toLocaleString('pt-BR')} composição(ões)
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link href={`/bases/${base.id}/importar` as any}>
                <Button variant="outline" size="sm" icon={<UploadCloud size={14} />}>Importar</Button>
              </Link>
              {basesExternas.length > 0 && (
                <Button
                  variant="outline" size="sm" icon={<RefreshCw size={14} />}
                  className="!border-secondary-300 !bg-secondary-50 !text-secondary-700 hover:!bg-secondary-100"
                  onClick={() => setPreencher(
                    preencher?.baseId === base.id ? null :
                    { baseId: base.id, referenciaId: basesExternas[0].id, loading: false, resultado: null }
                  )}
                >
                  Preencher preços
                </Button>
              )}
            </div>
          </div>
          {preencher?.baseId === base.id && (
            <form onSubmit={handlePreencher} className="flex items-center gap-3 flex-wrap border-t border-primary-100 bg-white/60 px-5 py-3">
              <span className="text-xs font-medium text-gray-700">Usar como referência:</span>
              <select
                value={preencher.referenciaId}
                onChange={e => setPreencher(prev => prev ? { ...prev, referenciaId: e.target.value, resultado: null } : null)}
                className="rounded border border-gray-300 px-2 py-1 text-xs outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                disabled={preencher.loading}
              >
                {basesExternas.map(b => (
                  <option key={b.id} value={b.id}>{b.orgao}</option>
                ))}
              </select>
              <Button type="submit" size="sm" loading={preencher.loading} className="!bg-secondary-600 hover:!bg-secondary-700">
                Preencher
              </Button>
              <button type="button" onClick={() => setPreencher(null)} className="text-xs text-gray-400 hover:text-gray-600">
                Cancelar
              </button>
              {preencher.resultado && <span className="text-xs font-medium text-secondary-800">{preencher.resultado}</span>}
            </form>
          )}
        </div>
      ))}

      {/* Bases oficiais / importadas */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Bases oficiais e importadas</p>
        {basesExternas.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <EmptyState
              icon={<Database size={20} />}
              title="Nenhuma base oficial cadastrada"
              description="Crie uma base acima (ex: SINAPI, SUDECAP) e depois importe insumos e composições."
            />
          </div>
        ) : (
          <Table>
            <Thead>
              <Th>Base</Th>
              <Th className="text-right">Insumos</Th>
              <Th className="text-right">Composições</Th>
              <Th>Ações</Th>
              <Th className="w-10" />
            </Thead>
            <Tbody>
              {basesExternas.map(base => (
                <Tr key={base.id} className={deletingId === base.id ? 'opacity-40' : ''}>
                  <Td className="font-medium text-gray-900">{base.orgao}</Td>
                  <Td className="text-right tabular-nums text-gray-700">
                    {base.total_insumos > 0 ? base.total_insumos.toLocaleString('pt-BR') : <span className="text-gray-300">—</span>}
                  </Td>
                  <Td className="text-right tabular-nums text-gray-700">
                    {base.total_composicoes > 0 ? base.total_composicoes.toLocaleString('pt-BR') : <span className="text-gray-300">—</span>}
                  </Td>
                  <Td>
                    <Link
                      href={`/bases/${base.id}/importar` as any}
                      className="text-xs font-medium text-primary-700 hover:underline"
                    >
                      Importar →
                    </Link>
                  </Td>
                  <Td>
                    <IconButton
                      label="Excluir base"
                      icon={<Trash2 size={14} />}
                      disabled={deletingId === base.id}
                      onClick={() => setConfirmDelete(base)}
                      className="!text-gray-400 hover:!bg-red-50 hover:!text-red-600"
                    />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Excluir base"
        danger
        confirmLabel="Excluir"
        description={
          confirmDelete
            ? (confirmDelete.total_insumos + confirmDelete.total_composicoes) > 0
              ? `Excluir "${confirmDelete.orgao}"? Isso removerá ${confirmDelete.total_insumos.toLocaleString('pt-BR')} insumos e ${confirmDelete.total_composicoes.toLocaleString('pt-BR')} composições da biblioteca global.`
              : `Excluir "${confirmDelete.orgao}"?`
            : ''
        }
      />
    </div>
  )
}
