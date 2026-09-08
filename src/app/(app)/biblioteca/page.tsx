import { BibliotecaExplorer } from './biblioteca-explorer';
import { fetchBiblioteca } from './fetch-biblioteca';
import type { BibliotecaFilters } from './types';
import type { CategoriaAbc } from '@/lib/curva-abc';

const CATEGORIAS: CategoriaAbc[] = ['materiais', 'mao_de_obra', 'equipamentos', 'servicos'];

/**
 * Minha Biblioteca: conteúdo da base própria do usuário (tipo_base='propria'),
 * a mesma que /bases/[id] mostra por UUID — aqui numa rota fixa e amigável,
 * com filtro de categoria (só Insumos) e "usado em N orçamentos" que
 * /bases/[id] não tem (ver decisão de não tocar naquela rota, usada por
 * todas as bases inclusive as externas grandes).
 */
export default async function BibliotecaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; categoria?: string; page?: string }>;
}) {
  const { tab, q, categoria, page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const filters: BibliotecaFilters = {
    tab: tab === 'composicoes' ? 'composicoes' : 'insumos',
    q: q ?? '',
    categoria: CATEGORIAS.includes(categoria as CategoriaAbc) ? (categoria as CategoriaAbc) : null,
  };
  const data = await fetchBiblioteca(filters, page);
  return <BibliotecaExplorer initialFilters={filters} initialPage={page} initialData={data} />;
}
