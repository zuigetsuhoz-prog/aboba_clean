import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { syncWithSupabase, overwriteLocalWithSupabase, type SyncStatus } from '../sync';

interface AuthContextValue {
  user: User | null;
  authLoading: boolean;
  syncStatus: SyncStatus;
  triggerSync: () => void;
  syncNow: () => Promise<void>;
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
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pull+merge then push — used for all sync operations
  const doSync = useCallback(async (userId: string) => {
    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }
    setSyncStatus('syncing');
    try {
      await syncWithSupabase(userId);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('error');
    }
  }, []);

  // Debounced trigger: for background auto-sync
  const triggerSync = useCallback(() => {
    setUser(prev => {
      if (!prev) return prev;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => doSync(prev.id), 2000);
      return prev;
    });
  }, [doSync]);

  // Immediate sync (for "Sync now" button)
  const syncNow = useCallback(async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    await doSync(u.id);
  }, [doSync]);

  // Force overwrite local from cloud (for "Pull from cloud" button)
  const pullFromCloud = useCallback(async () => {
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    if (!navigator.onLine) { setSyncStatus('offline'); return; }
    setSyncStatus('syncing');
    try {
      await overwriteLocalWithSupabase(u.id);
      setSyncStatus('synced');
    } catch {
      setSyncStatus('error');
    }
  }, []);

  useEffect(() => {
    // Restore session on mount — always pull+merge on startup
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      setAuthLoading(false);
      if (u) {
        setSyncStatus('syncing');
        syncWithSupabase(u.id)
          .then(() => setSyncStatus('synced'))
          .catch(() => setSyncStatus('error'));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Periodic background sync every 60s when logged in and online
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      if (navigator.onLine) doSync(user.id);
    }, 60_000);
    return () => clearInterval(interval);
  }, [user, doSync]);

  // Online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setUser(u => {
        if (u) doSync(u.id);
        return u;
      });
    };
    const handleOffline = () => setSyncStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [doSync]);

  const signIn = async (email: string, password: string) => {
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) {
      setUser(data.user);
      setSyncStatus('syncing');
      try {
        await syncWithSupabase(data.user.id);
        setSyncStatus('synced');
      } catch {
        setSyncStatus('error');
      }
    }
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSyncStatus('idle');
  };

  return (
    <AuthContext.Provider value={{ user, authLoading, syncStatus, triggerSync, syncNow, pullFromCloud, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
