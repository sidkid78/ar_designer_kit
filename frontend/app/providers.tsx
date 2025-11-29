'use client';

/**
 * app/providers.tsx - App-wide providers
 */

import { AuthProvider } from '@/hooks/useAuth';

interface ProvidersProps {
  children: React.ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}