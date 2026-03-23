import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { pushToSupabase, overwriteLocalWithSupabase, type SyncStatus, type SyncProgress } from '../sync';

const LAST_SYNCED_KEY = 'lastSyncedAt';

interface AuthContextValue {
  user: User | null;
  authLoading: boolean;
  syncStatus: SyncStatus;
  syncProgress: SyncProgress;
  lastSyncedAt: number | null;
  pushToCloud: () => Promise<void>;
  pullFromCloud: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(() => {
    const stored = localStorage.getItem(LAST_SYNCED_KEY);
    return stored ? Number(stored) : null;
  });

  const recordSync = useCallback(() => {
    const ts = Date.now();
    localStorage.setItem(LAST_SYNCED_KEY, String(ts));
    setLastSyncedAt(ts);
    setSyncStatus('synced');
    setSyncProgress(null);
  }, []);

  // Manual push: upload all local data to Supabase, overwriting cloud copy
  const pushToCloud = useCallback(async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    if (!navigator.onLine) { setSyncStatus('offline'); return; }
    setSyncStatus('syncing');
    setSyncProgress(null);
    try {
      await pushToSupabase(u.id, (loaded, total) => setSyncProgress({ loaded, total }));
      recordSync();
    } catch {
      setSyncStatus('error');
      setSyncProgress(null);
    }
  }, [recordSync]);

  // Manual pull: download all cloud data to local, overwriting local copy
  const pullFromCloud = useCallback(async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    if (!navigator.onLine) { setSyncStatus('offline'); return; }
    setSyncStatus('syncing');
    setSyncProgress(null);
    try {
      await overwriteLocalWithSupabase(u.id, (loaded, total) => setSyncProgress({ loaded, total }));
      recordSync();
    } catch {
      setSyncStatus('error');
      setSyncProgress(null);
    }
  }, [recordSync]);

  useEffect(() => {
    // Restore session on mount — no auto-sync, just restore auth state
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) setUser(data.user);
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSyncStatus('idle');
    setSyncProgress(null);
  };

  return (
    <AuthContext.Provider value={{ user, authLoading, syncStatus, syncProgress, lastSyncedAt, pushToCloud, pullFromCloud, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
