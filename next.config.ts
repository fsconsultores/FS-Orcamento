import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    typedRoutes: true,
    experimental: {
        serverActions: {
            bodySizeLimit: '10mb',
        },
        // Habilita otimização de pacotes: tree-shakes automaticamente imports pesados
        optimizePackageImports: ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
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

export default nextConfig;
