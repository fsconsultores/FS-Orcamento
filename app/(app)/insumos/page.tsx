import { createClient } from '@/lib/supabase/server';
import { formatCurrency } from '@/lib/costs';
import type { Insumo } from '@/lib/supabase/types';

export default async function InsumosPage() {
  const supabase = await createClient();
  const { data: insumos, error } = await supabase
    .from('tabela_insumos')
    .select('*')
    .order('codigo');

  if (error) throw error;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insumos</h1>
          <p className="mt-1 text-sm text-gray-500">
            Biblioteca de materiais e mão de obra (somente leitura)
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Descrição</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Unidade</th>
              <th className="px-4 py-3 text-right font-medium text-gray-600">Preço base</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Fonte</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(insumos as Insumo[]).map((insumo) => (
              <tr key={insumo.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{insumo.codigo}</td>
                <td className="px-4 py-3 text-gray-900">{insumo.descricao}</td>
                <td className="px-4 py-3 text-gray-600">{insumo.unidade}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {formatCurrency(insumo.preco_base)}
                </td>
                <td className="px-4 py-3 text-gray-500">{insumo.fonte ?? '—'}</td>
              </tr>
            ))}
            {insumos?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  Nenhum insumo cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
