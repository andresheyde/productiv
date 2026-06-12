import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useAuth } from "@/features/auth/AuthProvider";

WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackScreen() {
  const { sessionToken } = useLocalSearchParams<{ sessionToken?: string }>();
  const { refreshAuthState, setSessionToken } = useAuth();
  const router = useRouter();

  useEffect(() => {
    async function completeAuthFlow() {
      if (typeof sessionToken === "string" && sessionToken.length > 0) {
        setSessionToken(sessionToken);
        router.replace("/");
        return;
      }

      await refreshAuthState();
      router.replace("/");
    }

    void completeAuthFlow();
  }, [refreshAuthState, router, sessionToken, setSessionToken]);

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
