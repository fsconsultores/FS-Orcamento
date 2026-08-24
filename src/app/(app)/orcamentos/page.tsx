import { createClient } from '@/lib/supabase/server';
import { OrcamentosExplorer } from './orcamentos-explorer';
import { fetchOrcamentos } from './fetch-orcamentos';
import type { OrcamentosFilters } from './types';

export default async function OrcamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; favoritos?: string; semVersao?: string; modelos?: string }>;
}) {
  const { q, favoritos, semVersao, modelos } = await searchParams;
  const modelosAtivo = modelos === '1';

  const filters: OrcamentosFilters = {
    q: q ?? '',
    favoritos: !modelosAtivo && favoritos === '1',
    modelos: modelosAtivo,
    semVersao: semVersao === '1',
  };

  // Orçamentos agora são visíveis e editáveis por todo o domínio (RLS
  // relaxada em 20260724000000_orcamentos_visiveis_dominio.sql). Ainda
  // precisamos do usuário atual só pra marcar o dono ao duplicar um
  // orçamento (linha otimista em orcamentos-list.tsx).
  const sb = (await createClient()) as any;
  const [{ data: { user: currentUser } }, data] = await Promise.all([
    sb.auth.getUser(),
    fetchOrcamentos(filters),
  ]);

  return <OrcamentosExplorer initialFilters={filters} initialData={data} currentUserId={currentUser?.id ?? null} />;
}
