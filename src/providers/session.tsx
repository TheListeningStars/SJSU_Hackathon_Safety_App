import type { Session } from '@supabase/supabase-js';
import { createContext, use, useCallback, useEffect, useState, type PropsWithChildren } from 'react';

import { fetchProfile, type Profile } from '@/lib/api';
import { supabase } from '@/lib/supabase';

type SessionContextValue = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (next: Session | null) => {
    try {
      setProfile(next ? await fetchProfile(next.user.id) : null);
    } catch (e) {
      console.warn('Failed to load profile', e);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session);
      setIsLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Supabase warns against awaiting other client calls inside this callback.
      setTimeout(() => loadProfile(next), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return (
    <SessionContext value={{ session, profile, isLoading, refreshProfile, signOut }}>
      {children}
    </SessionContext>
  );
}

/** Onboarding is done once the profile is filled in and an ID is awaiting or passed review. */
export function isOnboarded(profile: Profile | null) {
  return (
    !!profile?.first_name &&
    !!profile.avatar_path &&
    (profile.verification_status === 'pending' || profile.verification_status === 'verified')
  );
}
