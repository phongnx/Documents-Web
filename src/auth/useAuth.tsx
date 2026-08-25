import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { get, ref } from 'firebase/database';
import { auth, db, googleProvider, firebaseReady } from '../lib/firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  /** false khi thiếu cấu hình Firebase (.env) */
  ready: boolean;
  /** Tài khoản có trong whitelist `admin/allowed` không?
   * null = chưa đăng nhập / đang kiểm tra. Chốt bảo mật THẬT nằm ở database rules
   * (mọi read/write đều bị chặn server-side) — cờ này chỉ để UI hiện màn chặn tử tế. */
  allowed: boolean | null;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Đọc cờ whitelist sau khi đăng nhập (rule chỉ cho mỗi uid đọc cờ của chính mình).
  useEffect(() => {
    if (!db || !user) {
      setAllowed(null);
      return;
    }
    let stale = false;
    get(ref(db, `admin/allowed/${user.uid}`))
      .then((snap) => {
        if (!stale) setAllowed(snap.val() === true);
      })
      .catch(() => {
        // Lỗi đọc (mạng/permission) → coi như chưa được cấp quyền; rules vẫn chặn thật.
        if (!stale) setAllowed(false);
      });
    return () => {
      stale = true;
    };
  }, [user]);

  const signIn = async () => {
    if (!auth || !googleProvider) return;
    await signInWithPopup(auth, googleProvider);
  };

  const signOutUser = async () => {
    if (!auth) return;
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, ready: firebaseReady, allowed, signIn, signOutUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
