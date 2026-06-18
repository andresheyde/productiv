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

type AuthContextValue = {
  clearSession: () => Promise<void>;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  refreshAuthState: () => Promise<boolean>;
  sessionToken: string | null;
  setSessionToken: (nextSessionToken: string) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [hasWebSession, setHasWebSession] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(Platform.OS !== "web");

  const refreshAuthState = useCallback(async () => {
    if (Platform.OS !== "web") {
      setIsAuthReady(true);
      return sessionToken !== null;
    }

    setIsAuthReady(false);

    try {
      const result = await fetchAuthSession();
      setHasWebSession(result.isAuthenticated);
      return result.isAuthenticated;
    } catch {
      setHasWebSession(false);
      return false;
    } finally {
      setIsAuthReady(true);
    }
  }, [sessionToken]);

  const clearSession = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        await logoutAuthSession();
      }
    } finally {
      setSessionTokenState(null);
      setHasWebSession(false);
      setIsAuthReady(true);
    }
  }, []);

  const setSessionToken = useCallback((nextSessionToken: string) => {
    setSessionTokenState(nextSessionToken);
    setHasWebSession(false);
    setIsAuthReady(true);
  }, []);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    void refreshAuthState();
  }, [refreshAuthState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      clearSession,
      isAuthenticated: sessionToken !== null || hasWebSession,
      isAuthReady,
      refreshAuthState,
      sessionToken,
      setSessionToken,
    }),
    [
      clearSession,
      hasWebSession,
      isAuthReady,
      refreshAuthState,
      sessionToken,
      setSessionToken,
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
