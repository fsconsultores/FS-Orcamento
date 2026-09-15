'use client'

import { Plus, X, ChevronUp, ChevronDown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { IconButton } from '@/components/ui/button'

export interface CategoriaResumoForm {
  id: string
  nome: string
}

const SEM_CATEGORIA = ''

/**
 * Editor das categorias de agrupamento da tabela "(A) DETALHAMENTO DOS
 * CUSTOS" do Resumo Geral do Caderno (ver categorias-resumo.ts) — o usuário
 * cria/renomeia/reordena/apaga categorias livremente, e atribui cada grupo
 * de nível 1 da planilha a uma delas (ou deixa sem categoria, o que o
 * mantém como linha solta na tabela, igual antes desta feature existir).
 * Totalmente controlado — quem chama guarda o estado, aqui só a mutação.
 */
export function CategoriasResumoEditor({
  categorias,
  onChangeCategorias,
  gruposNivel1,
  atribuicoes,
  onChangeAtribuicoes,
}: {
  categorias: CategoriaResumoForm[]
  onChangeCategorias: (categorias: CategoriaResumoForm[]) => void
  gruposNivel1: { numero: string; descricao: string }[]
  atribuicoes: Record<string, string>
  onChangeAtribuicoes: (atribuicoes: Record<string, string>) => void
}) {
  function add() {
    onChangeCategorias([...categorias, { id: crypto.randomUUID(), nome: '' }])
  }

  function rename(id: string, nome: string) {
    onChangeCategorias(categorias.map(c => (c.id === id ? { ...c, nome } : c)))
  }

  function remove(id: string) {
    onChangeCategorias(categorias.filter(c => c.id !== id))
    // Grupos atribuídos à categoria removida voltam a ficar soltos — nunca
    // deixa uma atribuição apontando pra um id de categoria que não existe mais.
    const next = { ...atribuicoes }
    for (const numero of Object.keys(next)) {
      if (next[numero] === id) delete next[numero]
    }
    onChangeAtribuicoes(next)
  }

  function move(id: string, direction: -1 | 1) {
    const index = categorias.findIndex(c => c.id === id)
    const alvo = index + direction
    if (index < 0 || alvo < 0 || alvo >= categorias.length) return
    const next = [...categorias]
    ;[next[index], next[alvo]] = [next[alvo], next[index]]
    onChangeCategorias(next)
  }

  function setAtribuicao(numero: string, categoriaId: string) {
    if (categoriaId === SEM_CATEGORIA) {
      const next = { ...atribuicoes }
      delete next[numero]
      onChangeAtribuicoes(next)
      return
    }
    onChangeAtribuicoes({ ...atribuicoes, [numero]: categoriaId })
  }

  const categoriasComNome = categorias.filter(c => c.nome.trim())

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700">Categorias</label>
          <button type="button" onClick={add} className="flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline">
            <Plus size={12} /> Adicionar categoria
          </button>
        </div>
        {categorias.length === 0 ? (
          <p className="mt-1 text-xs text-gray-400">Nenhuma categoria criada — os grupos aparecem soltos na tabela, como hoje.</p>
        ) : (
          <div className="mt-2 space-y-1.5">
            {categorias.map((c, i) => (
              <div key={c.id} className="flex items-center gap-1.5">
                <div className="flex shrink-0 flex-col">
                  <IconButton label="Mover para cima" icon={<ChevronUp size={12} />} variant="outline" size="sm" disabled={i === 0} onClick={() => move(c.id, -1)} />
                  <IconButton label="Mover para baixo" icon={<ChevronDown size={12} />} variant="outline" size="sm" disabled={i === categorias.length - 1} onClick={() => move(c.id, 1)} />
                </div>
                <Input
                  value={c.nome}
                  onChange={e => rename(c.id, e.target.value)}
                  placeholder="Nome da categoria (ex: A - Projetos e Serviços Técnicos)"
                  className="flex-1"
                />
                <IconButton label="Remover categoria" icon={<X size={14} />} variant="outline" onClick={() => remove(c.id)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-xs text-gray-500">
          Escolha em qual categoria cada grupo de nível 1 da planilha entra. Grupo sem categoria
          continua aparecendo solto na tabela &quot;(A) DETALHAMENTO DOS CUSTOS&quot; do Caderno.
        </p>
        {gruposNivel1.length === 0 ? (
          <p className="mt-1 text-xs text-gray-400">Nenhum grupo de nível 1 cadastrado na planilha.</p>
        ) : (
          <div className="mt-2 max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {gruposNivel1.map(g => (
              <div key={g.numero} className="flex items-center gap-2">
                <span className="w-16 shrink-0 font-mono text-xs text-gray-400">{g.numero}</span>
                <span className="flex-1 truncate text-sm text-gray-700" title={g.descricao}>{g.descricao}</span>
                <select
                  value={atribuicoes[g.numero] ?? SEM_CATEGORIA}
                  onChange={e => setAtribuicao(g.numero, e.target.value)}
                  className="w-64 shrink-0 rounded-md border border-gray-300 px-2 py-1.5 text-xs outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                >
                  <option value={SEM_CATEGORIA}>— Sem categoria —</option>
                  {categoriasComNome.map(c => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
