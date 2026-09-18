export function productionEnvErrors(env: NodeJS.ProcessEnv = process.env): string[] {
  const required = [
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRICE_PRO',
    'STRIPE_PRICE_BUSINESS',
    'APP_SIGNING_SECRET',
    'INTEGRATION_ENCRYPTION_KEY',
    'PRIVACY_HASH_PEPPER',
    'HEALTHCHECK_SECRET',
  ];
  const errors = required.filter((name) => !env[name]?.trim()).map((name) => `Falta ${name}`);
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? '';
  if (appUrl && (!appUrl.startsWith('https://') || appUrl.includes('localhost'))) {
    errors.push('NEXT_PUBLIC_APP_URL debe ser HTTPS y no localhost');
  }
  if ((env.WHATSAPP_TOKEN || env.WHATSAPP_PHONE_NUMBER_ID) && !env.WHATSAPP_APP_SECRET) {
    errors.push('Falta WHATSAPP_APP_SECRET para autenticar webhooks Meta');
  }
  return errors;
}
