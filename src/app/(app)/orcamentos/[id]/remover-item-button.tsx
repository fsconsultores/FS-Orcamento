'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function RemoverItemButton({
  itemId,
  orcamentoId,
}: {
  itemId: string;
  orcamentoId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    if (!confirm('Remover este item?')) return;
    setLoading(true);
    const supabase = createClient();
    await supabase.from('tabela_itens_orcamento').delete().eq('id', itemId);
    startTransition(() => router.refresh());
    setLoading(false);
  }

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
    >
      {loading ? '...' : 'Remover'}
    </button>
  );
}
