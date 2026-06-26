import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import {
  getToken,
  getStoredUser,
  setToken,
  setStoredUser,
  clearAuth,
  setUnauthorizedCallback,
  type StoredUser,
} from "@/lib/auth";
import { getPermissionsForRole, type Permission } from "@/lib/permissions";

interface AuthContextValue {
  token: string | null;
  user: StoredUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  role: string | null;
  permissions: Permission[];
  authLogin: (token: string, user: StoredUser) => void;
  authLogout: () => void;
  hasPermission: (perm: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState]   = useState<string | null>(getToken);
  const [user, setUser]          = useState<StoredUser | null>(getStoredUser);
  const [, navigate]             = useLocation();

  const role: string | null = user
    ? user.type === "admin"
      ? (user.role ?? "admin")
      : "member"
    : null;

  const permissions: Permission[] = role ? getPermissionsForRole(role) : [];

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
    navigate("/login");
  }, [navigate]);

  useEffect(() => {
    setUnauthorizedCallback(authLogout);
  }, [authLogout]);

  const checkPermission = useCallback(
    (perm: Permission) => permissions.includes(perm),
    [permissions],
  );

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        isAuthenticated: !!token,
        isAdmin: user?.type === "admin",
        role,
        permissions,
        authLogin,
        authLogout,
        hasPermission: checkPermission,
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
