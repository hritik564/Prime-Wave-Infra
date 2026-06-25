import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import {
  getToken,
  getStoredUser,
  setToken,
  setStoredUser,
  clearAuth,
  type StoredUser,
} from "@/lib/auth";

interface AuthContextValue {
  token: string | null;
  user: StoredUser | null;
  isAuthenticated: boolean;
  authLogin: (token: string, user: StoredUser) => void;
  authLogout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getToken);
  const [user, setUser] = useState<StoredUser | null>(getStoredUser);

  const authLogin = useCallback((newToken: string, newUser: StoredUser) => {
    setToken(newToken);
    setStoredUser(newUser);
    setTokenState(newToken);
    setUser(newUser);
  }, []);

  const authLogout = useCallback(() => {
    clearAuth();
    setTokenState(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token,
        authLogin,
        authLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
