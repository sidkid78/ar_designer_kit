'use client';

/**
 * hooks/useAuth.ts - Firebase Authentication hook
 */

import React, { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { 
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

// ============================================================================
// Types
// ============================================================================

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextType | null>(null);

// ============================================================================
// Provider
// ============================================================================

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirectChecked, setRedirectChecked] = useState(false);

  // Handle redirect result FIRST (for mobile auth)
  useEffect(() => {
    console.log('[Auth] Checking redirect result...');
    getRedirectResult(auth)
      .then((result) => {
        console.log('[Auth] Redirect result:', result?.user?.email ?? 'no user');
        if (result?.user) {
          setUser(result.user);
        }
      })
      .catch((error) => {
        console.error('[Auth] Redirect auth error:', error);
      })
      .finally(() => {
        setRedirectChecked(true);
      });
  }, []);

  // Then listen for auth state changes
  useEffect(() => {
    // Wait for redirect check to complete first
    if (!redirectChecked) return;

    console.log('[Auth] Starting auth state listener...');
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      console.log('[Auth] Auth state changed:', authUser?.email ?? 'no user');
      setUser(authUser);
      setLoading(false);
    });

    return unsubscribe;
  }, [redirectChecked]);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    
    try {
      // Try popup first (works better when domains differ)
      await signInWithPopup(auth, provider);
    } catch (error: unknown) {
      console.error('[Auth] Popup failed, trying redirect:', error);
      // Fall back to redirect if popup is blocked
      await signInWithRedirect(auth, provider);
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user: user as unknown as User | null, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}
