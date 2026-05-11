import { redirect } from 'next/navigation';

export default async function OrcamentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/orcamentos/${id}/planilha`);
}
