import {
  createContext,
  PropsWithChildren,
  useContext,
  useMemo,
  useState,
} from "react";

type AuthContextValue = {
  authId: string | null;
  isAuthenticated: boolean;
  setAuthId: (nextAuthId: string) => void;
  clearAuthId: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [authId, setAuthIdState] = useState<string | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      authId,
      isAuthenticated: authId !== null,
      setAuthId: (nextAuthId: string) => setAuthIdState(nextAuthId),
      clearAuthId: () => setAuthIdState(null),
    }),
    [authId],
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
