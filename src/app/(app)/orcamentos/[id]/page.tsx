import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { formatCurrency, formatNumber } from '@/lib/costs';
import { AdicionarItemForm } from './adicionar-item-form';
import { RemoverItemButton } from './remover-item-button';
import { EditarItemButton } from './editar-item-button';
import type { Orcamento } from '@/lib/supabase/types';

type ItemOrc = { id: string; quantidade: number; bdi_especifico: number | null; composicao_id: string };
type CustoComp = {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  custo_unitario: number;
  base_id: string | null;
  orgao: string | null;
  tipo_base: string | null;
};

export default async function OrcamentoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const sb = supabase as any;

  const [rawOrc, rawItens, rawCustos] = await Promise.all([
    sb.from('tabela_orcamentos').select('id, nome_obra, cliente, data, bdi_global, codigo').eq('id', id).single(),
    sb.from('tabela_itens_orcamento')
      .select('id, quantidade, bdi_especifico, composicao_id')
      .eq('orcamento_id', id)
      .order('created_at'),
    sb.from('vw_custo_composicao')
      .select('id, codigo, descricao, unidade, custo_unitario, base_id, orgao, tipo_base')
      .order('codigo'),
  ]);

  if (rawOrc?.error || !rawOrc?.data) notFound();

  await sb.from('tabela_orcamentos').update({ ultimo_acesso: new Date().toISOString() }).eq('id', id);

  const orcamento = rawOrc.data as Orcamento;
  const itens = (rawItens?.data ?? []) as ItemOrc[];
  const custosMap = Object.fromEntries(
    ((rawCustos?.data ?? []) as CustoComp[]).map((c) => [c.id, c])
  );

  let totalSemBdi = 0;
  let totalComBdi = 0;

  const itensCalculados = itens.map((item) => {
    const comp = custosMap[item.composicao_id] ?? null;
    const custoUnit = comp?.custo_unitario ?? 0;
    const bdi = item.bdi_especifico ?? orcamento.bdi_global;
    const semBdi = item.quantidade * custoUnit;
    const comBdi = semBdi * (1 + bdi / 100);
    totalSemBdi += semBdi;
    totalComBdi += comBdi;
    return { ...item, comp, custoUnit, semBdi, comBdi, bdi };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/orcamentos" className="text-sm text-blue-600 hover:underline">
            ← Orçamentos
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">{orcamento.nome_obra}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {orcamento.cliente && <span>{orcamento.cliente} · </span>}
            {new Date(orcamento.data).toLocaleDateString('pt-BR')} · BDI global {orcamento.bdi_global}%
          </p>
        </div>
        <div className="flex items-start gap-3">
          <div className="text-right">
            <p className="text-xs text-gray-400">Total com BDI</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalComBdi)}</p>
            <p className="text-xs text-gray-400">Sem BDI: {formatCurrency(totalSemBdi)}</p>
          </div>
          <Link
            href={`/orcamentos/${id}/editar`}
            className="rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Editar
          </Link>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold text-gray-900">Itens do orçamento</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Composição</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Und.</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Qtd.</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Custo unit.</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">BDI (%)</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Total c/ BDI</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {itensCalculados.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{item.comp?.descricao}</p>
                  <p className="text-xs text-gray-400">{item.comp?.codigo}</p>
                </td>
                <td className="px-4 py-3 text-gray-600">{item.comp?.unidade}</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatNumber(item.quantidade, 2)}</td>
                <td className="px-4 py-3 text-right text-gray-700">{formatCurrency(item.custoUnit)}</td>
                <td className="px-4 py-3 text-right text-gray-500">
                  {formatNumber(item.bdi, 2)}
                  {item.bdi_especifico !== null && (
                    <span className="ml-1 text-xs text-blue-500">(específico)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {formatCurrency(item.comBdi)}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <EditarItemButton
                      itemId={item.id}
                      quantidade={item.quantidade}
                      bdiEspecifico={item.bdi_especifico}
                      bdiGlobal={orcamento.bdi_global}
                    />
                    <RemoverItemButton itemId={item.id} orcamentoId={id} />
                  </div>
                </td>
              </tr>
            ))}
            {itensCalculados.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  Nenhum item adicionado.
                </td>
              </tr>
            )}
          </tbody>
          {itensCalculados.length > 0 && (
            <tfoot className="border-t bg-gray-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right font-semibold text-gray-700">
                  Total
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">
                  {formatCurrency(totalComBdi)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <AdicionarItemForm
        orcamentoId={id}
        bdiGlobal={orcamento.bdi_global}
        composicoes={(rawCustos?.data ?? []) as CustoComp[]}
      />
    </div>
  );
}