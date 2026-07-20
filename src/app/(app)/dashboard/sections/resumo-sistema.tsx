import { Package, Layers3, ListChecks, Wrench, HardHat, Boxes } from 'lucide-react'
import { StatCard } from '@/components/ui/stat-row'

// totalServicos aqui já vem somado com mão de obra (classificarCategoriaAbc
// separa as duas, mas o pedido original só lista 3 categorias — serviços,
// equipamentos, materiais — sem um card à parte para mão de obra).
export function ResumoSistema({
  totalInsumosGlobais,
  totalComposicoesGlobais,
  totalItensOrcados,
  totalServicos,
  totalEquipamentos,
  totalMateriais,
}: {
  totalInsumosGlobais: number
  totalComposicoesGlobais: number
  totalItensOrcados: number
  totalServicos: number
  totalEquipamentos: number
  totalMateriais: number
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatCard href="/insumos" icon={<Package size={16} />} label="Insumos globais" value={totalInsumosGlobais.toLocaleString('pt-BR')} />
      <StatCard href="/composicoes" icon={<Layers3 size={16} />} label="Composições globais" value={totalComposicoesGlobais.toLocaleString('pt-BR')} />
      <StatCard href="/orcamentos" icon={<ListChecks size={16} />} label="Itens orçados" value={totalItensOrcados.toLocaleString('pt-BR')} />
      <StatCard icon={<HardHat size={16} />} label="Serviços" value={totalServicos.toLocaleString('pt-BR')} />
      <StatCard icon={<Wrench size={16} />} label="Equipamentos" value={totalEquipamentos.toLocaleString('pt-BR')} />
      <StatCard icon={<Boxes size={16} />} label="Materiais" value={totalMateriais.toLocaleString('pt-BR')} />
    </div>
  )
}
