import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, type User } from "./api";

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, displayName: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (partial: Partial<User>) => void;
};

const AuthContext = createContext<AuthState | null>(null);
const STORAGE_KEY = "hez.auth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setLoading(false);
      return;
    }

    try {
      const saved = JSON.parse(raw) as { token: string; user: User };
      setToken(saved.token);
      setUser(saved.user);
      api
        .me(saved.token)
        .then((res) => {
          setUser(res.user);
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: saved.token, user: res.user }));
        })
        .catch(() => {
          localStorage.removeItem(STORAGE_KEY);
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setLoading(false);
    }
  }, []);

  const persist = useCallback((nextToken: string, nextUser: User) => {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: nextToken, user: nextUser }));
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await api.login({ username, password });
      persist(res.token, res.user);
    },
    [persist],
  );

  const register = useCallback(
    async (username: string, displayName: string, password: string) => {
      const res = await api.register({ username, displayName, password });
      persist(res.token, res.user);
    },
    [persist],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback(
    (partial: Partial<User>) => {
      setUser((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...partial };
        const curToken = localStorage.getItem(STORAGE_KEY);
        if (curToken) {
          const parsed = JSON.parse(curToken);
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: parsed.token, user: next }));
        }
        return next;
      });
    },
    [],
  );

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout, updateUser }),
    [user, token, loading, login, register, logout, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
