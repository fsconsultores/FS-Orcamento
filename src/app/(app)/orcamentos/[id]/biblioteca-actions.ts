'use server'

import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/supabase/auth'
import { registrarHistorico } from '@/lib/log'
import { promoverInsumoAvulso, promoverComposicao, type PromoverResult } from '@/lib/biblioteca/promover'

export type AdicionarBibliotecaResult = PromoverResult | { error: string }

export async function adicionarInsumoABibliotecaAction(
  orcamentoId: string,
  insumoId: string,
  sobrescrever = false
): Promise<AdicionarBibliotecaResult> {
  const supabase = await createClient()
  const user = await getUser(supabase)
  if (!user) return { error: 'Não autenticado.' }

  try {
    const result = await promoverInsumoAvulso(supabase, orcamentoId, insumoId, sobrescrever)
    if (result.status !== 'conflito') {
      registrarHistorico(supabase, {
        orcamentoId,
        entidade: 'insumo',
        tipo: 'sucesso',
        acao: 'adicionar_biblioteca',
        mensagem: `Insumo ${result.status === 'criado' ? 'adicionado à' : 'atualizado na'} Biblioteca pessoal`,
      }).catch(console.error)
    }
    return result
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao adicionar à Biblioteca.' }
  }
}

export async function adicionarComposicaoABibliotecaAction(
  orcamentoId: string,
  composicaoId: string,
  sobrescrever = false
): Promise<AdicionarBibliotecaResult> {
  const supabase = await createClient()
  const user = await getUser(supabase)
  if (!user) return { error: 'Não autenticado.' }

  try {
    const result = await promoverComposicao(supabase, orcamentoId, composicaoId, sobrescrever)
    if (result.status !== 'conflito') {
      registrarHistorico(supabase, {
        orcamentoId,
        entidade: 'composicao',
        tipo: 'sucesso',
        acao: 'adicionar_biblioteca',
        mensagem: `Composição ${result.status === 'criado' ? 'adicionada à' : 'atualizada na'} Biblioteca pessoal (com os insumos embutidos)`,
      }).catch(console.error)
    }
    return result
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro ao adicionar à Biblioteca.' }
  }
}
