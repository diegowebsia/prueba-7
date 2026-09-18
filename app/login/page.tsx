import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/AuthForm';
import { AuthSkeleton } from '@/components/Skeleton';

export const metadata: Metadata = { title: 'Entrar — ReviewFlow AI' };

export default function LoginPage({ searchParams }: { searchParams: { mode?: string } }) {
  // Compat: /login?mode=signup (antiguo) sigue funcionando como registro.
  const mode = searchParams.mode === 'signup' ? 'signup' : 'signin';
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <AuthForm mode={mode} />
    </Suspense>
  );
}
