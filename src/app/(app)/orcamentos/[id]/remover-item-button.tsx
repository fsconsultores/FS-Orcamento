'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ConfirmDialog } from '@/components/ui/modal';

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
  const [confirmando, setConfirmando] = useState(false);

  async function handleRemove() {
    setConfirmando(false);
    setLoading(true);
    const supabase = createClient();
    await supabase.from('tabela_itens_orcamento').delete().eq('id', itemId);
    startTransition(() => router.refresh());
    setLoading(false);
  }

  return (
    <>
      <button
        onClick={() => setConfirmando(true)}
        disabled={loading}
        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
      >
        {loading ? '...' : 'Remover'}
      </button>
      <ConfirmDialog
        open={confirmando}
        onClose={() => setConfirmando(false)}
        onConfirm={handleRemove}
        title="Remover item"
        description="Remover este item?"
        confirmLabel="Remover"
        danger
        loading={loading}
      />
    </>
  );
}
