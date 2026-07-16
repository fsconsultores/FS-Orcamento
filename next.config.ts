import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

const nextConfig: NextConfig = {
    typedRoutes: true,
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb',
        },
        // Habilita otimização de pacotes: tree-shakes automaticamente imports pesados
        optimizePackageImports: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
        // Cache de navegação do lado do cliente (Router Cache): reabrir uma aba
        // (Planilha/Insumos/Composições/...) visitada nos últimos 30s reaproveita
        // o payload já baixado, sem round-trip ao servidor. É por-navegador/por-
        // sessão (não compartilhado entre usuários, diferente de unstable_cache),
        // e qualquer Server Action que chame revalidatePath/revalidateTag ou
        // router.refresh() já invalida esse cache — convenção já usada em todo o
        // app (73 ocorrências), então dado editado nunca fica preso em cache.
        staleTimes: {
            dynamic: 30,
        },
    },
    // Desabilita source maps em produção (reduz bundle ~15-20%)
    productionBrowserSourceMaps: false,
    webpack: (config) => {
        config.resolve.fallback = {
            ...config.resolve.fallback,
            fs: false,
            path: false,
            os: false,
            crypto: false,
        };
        return config;
    },
};

export default withBundleAnalyzer(nextConfig);
