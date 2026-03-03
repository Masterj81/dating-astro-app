import { Session, User } from '@supabase/supabase-js';
import { createContext, useContext } from 'react';

// Auth Context Type
export type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isEmailVerified: boolean;
  onboardingCompleted: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<{ error: any }>;
  signInWithApple: () => Promise<{ error: any }>;
  signInWithFacebook: () => Promise<{ error: any }>;
  refreshProfile: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
