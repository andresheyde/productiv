import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useAuth } from "@/features/auth/AuthProvider";

WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackScreen() {
  const { returnTo, sessionToken } = useLocalSearchParams<{
    returnTo?: string;
    sessionToken?: string;
  }>();
  const { refreshAuthState, setSessionToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    async function completeAuthFlow() {
      const nextRoute = resolveReturnToPath(returnTo);

      if (typeof sessionToken === "string" && sessionToken.length > 0) {
        setSessionToken(sessionToken);
        await refreshAuthState(sessionToken);
        router.replace(nextRoute as never);
        return;
      }

      await refreshAuthState();
      router.replace(nextRoute as never);
    }

    void completeAuthFlow();
  }, [refreshAuthState, returnTo, router, sessionToken, setSessionToken]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: "#f4f1ea",
      }}
    >
      <ActivityIndicator size="large" color="#16423c" />
      <Text
        style={{
          marginTop: 16,
          fontSize: 16,
          color: "#16423c",
        }}
      >
        Finishing Google connection...
      </Text>
    </View>
  );
}

function resolveReturnToPath(returnTo: string | undefined) {
  return returnTo === "/" ||
    returnTo === "/goals" ||
    returnTo === "/tasks" ||
    returnTo === "/metrics" ||
    returnTo === "/calendar" ||
    returnTo === "/schedule"
    ? returnTo
    : "/";
}
