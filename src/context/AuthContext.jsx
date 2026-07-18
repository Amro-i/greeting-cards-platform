import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [profileError, setProfileError] = useState('');
  const mountedRef = useRef(true);
  const profileRequestRef = useRef(0);

  const loadProfile = useCallback(async (userId) => {
    if (!supabase || !userId) {
      if (mountedRef.current) {
        setProfile(null);
        setLoading(false);
      }
      return;
    }

    const requestId = ++profileRequestRef.current;
    if (mountedRef.current) {
      setLoading(true);
      setProfileError('');
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (!mountedRef.current || requestId !== profileRequestRef.current) return;

    if (error) {
      console.error('Profile load error:', error.message);
      setProfile(null);
      setProfileError(error.message || 'تعذر تحميل صلاحيات الحساب.');
    } else {
      setProfile(data ?? null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (!supabase) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    async function initializeAuth() {
      const { data, error } = await supabase.auth.getSession();
      if (!mountedRef.current) return;

      if (error) {
        console.error('Session load error:', error.message);
        setSession(null);
        setProfile(null);
        setProfileError(error.message);
        setLoading(false);
        return;
      }

      const initialSession = data.session ?? null;
      setSession(initialSession);

      if (initialSession?.user) {
        await loadProfile(initialSession.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    }

    void initializeAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Keep this callback synchronous. Supabase can deadlock when another async
      // Supabase request is awaited directly inside onAuthStateChange.
      setSession(nextSession);
      setProfile(null);
      setProfileError('');

      if (nextSession?.user) {
        setLoading(true);
        window.setTimeout(() => {
          void loadProfile(nextSession.user.id);
        }, 0);
      } else {
        setLoading(false);
      }
    });

    return () => {
      mountedRef.current = false;
      profileRequestRef.current += 1;
      authListener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileError,
      isConfigured: isSupabaseConfigured,
      signIn: async (email, password) => {
        if (!supabase) throw new Error('Supabase is not configured.');
        return supabase.auth.signInWithPassword({ email, password });
      },
      signOut: async () => {
        if (supabase) await supabase.auth.signOut();
      },
      reloadProfile: async () => {
        if (session?.user) await loadProfile(session.user.id);
      },
    }),
    [session, profile, loading, profileError, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}
