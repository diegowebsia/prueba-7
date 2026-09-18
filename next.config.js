/** @type {import('next').NextConfig} */
const isVercel = process.env.VERCEL === '1';
const isProduction = process.env.NODE_ENV === 'production';
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"} https://plausible.io`,
  `connect-src 'self' https://*.supabase.co https://plausible.io${isProduction ? '' : ' ws: wss:'}`,
  'frame-src https://js.stripe.com https://hooks.stripe.com',
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig = {
  ...(isVercel ? {} : { output: 'standalone' }),
  reactStrictMode: true,
  poweredByHeader: false,
  // Arena expone el servidor de desarrollo mediante un subdominio HTTPS.
  // Permite sus recursos HMR sin relajar los orígenes de producción.
  allowedDevOrigins: ['*.e2b.app'],
  serverExternalPackages: ['pg'],
  experimental: { serverActions: { bodySizeLimit: '2mb' } },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
module.exports = nextConfig;
