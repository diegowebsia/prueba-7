import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/AuthForm';
import { AuthSkeleton } from '@/components/Skeleton';

export const metadata: Metadata = {
  title: 'Crear cuenta — ReviewFlow AI',
  description: 'Regístrate y prueba ReviewFlow AI gratis durante 7 días.',
};

export default function RegistroPage() {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
