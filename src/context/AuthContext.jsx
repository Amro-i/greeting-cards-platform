import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getFriendlyClientError, retryOperation, withTimeout } from '../lib/reliability';
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

    let data;
    let error;
    try {
      const result = await retryOperation(
        () => withTimeout(() => supabase
          .from('profiles')
          .select('id, full_name, role, is_active')
          .eq('id', userId)
          .maybeSingle(), 15_000, 'استغرق تحميل صلاحيات الحساب وقتًا طويلًا.'),
        { attempts: 2, shouldRetry: () => navigator.onLine },
      );
      data = result.data;
      error = result.error;
    } catch (requestError) {
      error = requestError;
    }

    if (!mountedRef.current || requestId !== profileRequestRef.current) return;

    if (error) {
      console.error('Profile load error:', error.message);
      setProfile(null);
      setProfileError(getFriendlyClientError(error, 'تعذر تحميل صلاحيات الحساب.'));
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
      try {
        const { data, error } = await withTimeout(() => supabase.auth.getSession(), 15_000, 'استغرق التحقق من الجلسة وقتًا طويلًا.');
        if (!mountedRef.current) return;

        if (error) throw error;

        const initialSession = data.session ?? null;
        setSession(initialSession);

        if (initialSession?.user) {
          await loadProfile(initialSession.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      } catch (sessionError) {
        if (!mountedRef.current) return;
        console.error('Session load error:', sessionError?.message);
        setSession(null);
        setProfile(null);
        setProfileError(getFriendlyClientError(sessionError, 'تعذر التحقق من الجلسة.'));
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
        return withTimeout(() => supabase.auth.signInWithPassword({ email, password }), 20_000, 'استغرق تسجيل الدخول وقتًا طويلًا.');
      },
      signOut: async () => {
        if (supabase) await withTimeout(() => supabase.auth.signOut(), 12_000, 'استغرق تسجيل الخروج وقتًا طويلًا.');
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
