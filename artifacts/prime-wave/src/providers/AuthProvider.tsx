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
  setAdminToken,
  clearAdminToken,
  getAdminToken,
  setStoredUser,
  clearAuth,
  setUnauthorizedCallback,
  savePrevUser,
  getPrevUser,
  clearImpersonationState,
  isImpersonationToken,
  type StoredUser,
} from "@/lib/auth";
import { getPermissionsForRole, type Permission } from "@/lib/permissions";

interface AuthContextValue {
  token: string | null;
  user: StoredUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isImpersonating: boolean;
  role: string | null;
  permissions: Permission[];
  authLogin: (token: string, user: StoredUser) => void;
  authLogout: () => void;
  startImpersonating: (impToken: string, targetUser: StoredUser) => void;
  exitImpersonation: () => Promise<void>;
  hasPermission: (perm: Permission) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState]             = useState<string | null>(getToken);
  const [user, setUser]                    = useState<StoredUser | null>(getStoredUser);
  const [isImpersonating, setImpersonating] = useState<boolean>(
    () => { const t = getToken(); return !!t && isImpersonationToken(t); },
  );
  const [, navigate] = useLocation();

  const role: string | null = user
    ? user.type === "admin"
      ? (user.role ?? "admin")
      : "member"
    : null;

  const permissions: Permission[] = role ? getPermissionsForRole(role) : [];

  const authLogin = useCallback((newToken: string, newUser: StoredUser) => {
    if (newUser.type === "admin") {
      setAdminToken(newToken);
    } else {
      setToken(newToken);
    }
    setStoredUser(newUser);
    setTokenState(newToken);
    setUser(newUser);
    setImpersonating(false);
  }, []);

  const authLogout = useCallback(() => {
    const wasAdmin = getStoredUser()?.type === "admin";
    if (wasAdmin) {
      clearAdminToken();
    }
    clearAuth();
    clearImpersonationState();
    setTokenState(null);
    setUser(null);
    setImpersonating(false);
    navigate(wasAdmin ? "/admin/login" : "/login");
  }, [navigate]);

  /** Called after a successful POST /api/admin/users/:id/impersonate */
  const startImpersonating = useCallback(
    (impToken: string, targetUser: StoredUser) => {
      // Save the current admin user so we can restore it on exit
      const currentUser = getStoredUser();
      if (currentUser) savePrevUser(currentUser);

      // Set impersonation token as the active user token
      setToken(impToken);
      setStoredUser(targetUser);
      setTokenState(impToken);
      setUser(targetUser);
      setImpersonating(true);
      navigate("/dashboard");
    },
    [navigate],
  );

  /** Clears impersonation state and restores the original admin session. */
  const exitImpersonation = useCallback(async () => {
    const impToken   = getToken();        // impersonation JWT (used for the API call)
    const prevUser   = getPrevUser();     // saved admin user
    const adminToken = getAdminToken();   // admin JWT — never changed during impersonation

    // 1. Restore admin state synchronously (before any async ops)
    if (prevUser) {
      setStoredUser(prevUser);
      setUser(prevUser);
    }
    clearImpersonationState();  // removes pw:token + pw:imp:prev:user
    setTokenState(adminToken);
    setImpersonating(false);

    // 2. Best-effort API call to record session end server-side
    if (impToken) {
      void fetch("/api/auth/impersonation/exit", {
        method:  "POST",
        headers: { Authorization: `Bearer ${impToken}` },
      }).catch(() => { /* silent — state already cleaned up */ });
    }

    navigate("/admin/members");
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
        isAuthenticated:  !!token,
        isAdmin:          user?.type === "admin",
        isImpersonating,
        role,
        permissions,
        authLogin,
        authLogout,
        startImpersonating,
        exitImpersonation,
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
