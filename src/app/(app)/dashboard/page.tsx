import Link from 'next/link';
import { Suspense } from 'react';
import { WidgetSkeleton } from './widgets/widget-card';
import { WidgetQuantidadeProjetos } from './widgets/widget-quantidade-projetos';
import { WidgetUltimosProjetos } from './widgets/widget-ultimos-projetos';
import { WidgetValorTotal } from './widgets/widget-valor-total';
import { WidgetUltimosCommits } from './widgets/widget-ultimos-commits';
import { WidgetCurvaAbcResumida } from './widgets/widget-curva-abc-resumida';
import { WidgetAtividadesRecentes } from './widgets/widget-atividades-recentes';
import { WidgetBasesDados } from './widgets/widget-bases-dados';
import { IconPlus } from './widgets/icons';

export default async function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Início</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bem-vindo(a), o que deseja fazer?
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Ações rápidas</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/orcamentos/novo"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-4 py-2 text-sm font-medium text-white hover:bg-primary-800"
          >
            <IconPlus />
            Cadastrar Novo Orçamento
          </Link>
        </div>
      </div>

      {/* Widgets — cada um independente, com sua própria busca e streaming próprio */}

      {/* KPIs de abertura: os dois números que a diretoria olha primeiro */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Suspense fallback={<WidgetSkeleton title="Projetos" stat />}>
          <WidgetQuantidadeProjetos />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Valor total dos orçamentos" stat />}>
          <WidgetValorTotal />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Suspense fallback={<WidgetSkeleton title="Últimos projetos" />}>
          <WidgetUltimosProjetos />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Últimos commits" />}>
          <WidgetUltimosCommits />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Atividades recentes" />}>
          <WidgetAtividadesRecentes />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Curva ABC resumida" />}>
          <WidgetCurvaAbcResumida />
        </Suspense>
        <Suspense fallback={<WidgetSkeleton title="Bases utilizadas" />}>
          <WidgetBasesDados />
        </Suspense>
      </div>
    </div>
  );
}
