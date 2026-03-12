import { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useAuth } from "@/features/auth/AuthProvider";

export default function AuthCallbackScreen() {
  const { authId } = useLocalSearchParams<{ authId?: string }>();
  const { setAuthId } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (typeof authId !== "string" || authId.length === 0) {
      router.replace("/");
      return;
    }

    setAuthId(authId);
    router.replace("/");
  }, [authId, router, setAuthId]);

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
