/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === '1';

const nextConfig = {
  // Multi-host:
  // - Docker / VPS / Coolify / Render / Railway / Node puro → 'standalone'
  //   (servidor Node.js autocontenido: `npm run build && npm run start`).
  // - Vercel → sin `output` (usa su adaptador nativo; Vercel define VERCEL=1).
  ...(isVercel ? {} : { output: 'standalone' }),
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // El build de producción no se bloquea por warnings de lint.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // El CI puede correr `npm run typecheck` por separado.
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

module.exports = nextConfig;
