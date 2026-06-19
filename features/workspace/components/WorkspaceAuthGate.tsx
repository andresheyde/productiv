import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
} from "react-native";
import { usePathname } from "expo-router";

import { useAuth } from "@/features/auth/AuthProvider";
import { connectGoogleCalendar } from "@/features/auth/googleAuth";
import { getSessionTokenFromUrl } from "@/features/schedule/utils/scheduleAuth";

type WorkspaceAuthGateProps = {
  description: string;
  title: string;
};

export default function WorkspaceAuthGate({
  description,
  title,
}: WorkspaceAuthGateProps) {
  const pathname = usePathname();
  const { isAuthReady, refreshAuthState } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleConnect() {
    setErrorMessage(null);
    setIsConnecting(true);

    try {
      const result = await connectGoogleCalendar(pathname);

      if (result.type === "success") {
        const nextSessionToken = getSessionTokenFromUrl(result.url);

        if (nextSessionToken) {
          await refreshAuthState(nextSessionToken);
          return;
        }

        if (await refreshAuthState()) {
          return;
        }

        setErrorMessage(
          "Google authentication finished, but no session was created.",
        );
        return;
      }

      if (result.type === "cancel" || result.type === "dismiss") {
        setErrorMessage("Google authentication was cancelled.");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to start Google sign-in right now.",
      );
    } finally {
      setIsConnecting(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        justifyContent: "center",
        backgroundColor: "#f3efe6",
      }}
    >
      <View
        style={{
          borderRadius: 28,
          backgroundColor: "#fffaf2",
          borderWidth: 1,
          borderColor: "#dcd2c2",
          padding: 24,
          gap: 16,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 18,
            backgroundColor: "#123a35",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color: "#f4f0e8",
              fontSize: 24,
              fontWeight: "700",
            }}
          >
            P
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontSize: 24,
              fontWeight: "700",
              color: "#132521",
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: "#51605b",
            }}
          >
            {description}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            void handleConnect();
          }}
          disabled={!isAuthReady || isConnecting}
          style={{
            borderRadius: 18,
            paddingHorizontal: 18,
            paddingVertical: 16,
            backgroundColor:
              !isAuthReady || isConnecting ? "#cdd6d2" : "#123a35",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {isConnecting ? <ActivityIndicator color="#f4f0e8" /> : null}
          <Text
            style={{
              color: "#f4f0e8",
              fontSize: 15,
              fontWeight: "700",
            }}
          >
            {!isAuthReady
              ? "Checking Google session..."
              : isConnecting
                ? "Connecting..."
                : "Connect Google to continue"}
          </Text>
        </Pressable>

        {errorMessage ? (
          <Text
            style={{
              color: "#9f2f26",
              backgroundColor: "#fbe9e6",
              padding: 12,
              borderRadius: 14,
            }}
          >
            {errorMessage}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
