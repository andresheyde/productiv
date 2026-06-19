import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
  useEffect,
} from "react";
import { Platform } from "react-native";

import { fetchAuthSession, logoutAuthSession } from "@/features/auth/authApi";

export type AuthUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
};

type AuthContextValue = {
  clearSession: () => Promise<void>;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  refreshAuthState: (nextSessionToken?: string | null) => Promise<boolean>;
  sessionToken: string | null;
  setSessionToken: (nextSessionToken: string) => void;
  user: AuthUser | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const refreshAuthState = useCallback(
    async (nextSessionToken?: string | null) => {
      const tokenToUse =
        nextSessionToken === undefined ? sessionToken : nextSessionToken;

      if (Platform.OS !== "web" && !tokenToUse) {
        setUser(null);
        setIsAuthReady(true);
        return false;
      }

      if (Platform.OS === "web" && !tokenToUse && sessionToken) {
        setSessionTokenState(null);
      } else if (nextSessionToken !== undefined) {
        setSessionTokenState(nextSessionToken);
      }

      setIsAuthReady(false);

      try {
        const result = await fetchAuthSession(tokenToUse);
        setUser(result.user);

        if (!result.isAuthenticated && tokenToUse) {
          setSessionTokenState(null);
        }

        return result.isAuthenticated;
      } catch {
        setUser(null);

        if (tokenToUse) {
          setSessionTokenState(null);
        }

        return false;
      } finally {
        setIsAuthReady(true);
      }
    },
    [sessionToken],
  );

  const clearSession = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        await logoutAuthSession();
      }
    } finally {
      setSessionTokenState(null);
      setUser(null);
      setIsAuthReady(true);
    }
  }, []);

  const setSessionToken = useCallback((nextSessionToken: string) => {
    setSessionTokenState(nextSessionToken);
  }, []);

  useEffect(() => {
    void refreshAuthState();
  }, [refreshAuthState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      clearSession,
      isAuthenticated: user !== null,
      isAuthReady,
      refreshAuthState,
      sessionToken,
      setSessionToken,
      user,
    }),
    [
      clearSession,
      isAuthReady,
      refreshAuthState,
      sessionToken,
      setSessionToken,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
