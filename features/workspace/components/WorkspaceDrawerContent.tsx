import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  DrawerItemList,
} from "@react-navigation/drawer";
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import { usePathname } from "expo-router";

import { useAuth } from "@/features/auth/AuthProvider";
import { connectGoogleCalendar } from "@/features/auth/googleAuth";
import { getSessionTokenFromUrl } from "@/features/schedule/utils/scheduleAuth";

export default function WorkspaceDrawerContent(
  props: DrawerContentComponentProps,
) {
  const pathname = usePathname();
  const {
    clearSession,
    isAuthenticated,
    isAuthReady,
    refreshAuthState,
    user,
  } = useAuth();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
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
          : "Unable to start Google connection.",
      );
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleReset() {
    setErrorMessage(null);
    setIsResetting(true);

    try {
      await clearSession();
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: "#0d302c",
      }}
    >
      <View
        style={{
          paddingHorizontal: 18,
          paddingTop: 10,
          paddingBottom: 18,
          gap: 16,
        }}
      >
        <View
          style={{
            gap: 10,
            padding: 18,
            borderRadius: 24,
            backgroundColor: "#123a35",
            borderWidth: 1,
            borderColor: "#2a5b54",
          }}
        >
          <Text
            style={{
              color: "#f4f0e8",
              fontSize: 22,
              fontWeight: "700",
            }}
          >
            Productiv
          </Text>
          <Text
            style={{
              color: "#bfd1ca",
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            A chat-first workspace for goals, tasks, progress, and calendar
            follow-through.
          </Text>
        </View>

        <View
          style={{
            padding: 16,
            borderRadius: 22,
            backgroundColor: "#164741",
            gap: 12,
          }}
        >
          {isAuthenticated && user ? (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                {user.avatarUrl ? (
                  <Image
                    source={{ uri: user.avatarUrl }}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 16,
                      backgroundColor: "#0d302c",
                    }}
                  />
                ) : (
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 16,
                      backgroundColor: "#0d302c",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: "#f4f0e8",
                        fontWeight: "700",
                        fontSize: 18,
                      }}
                    >
                      {(user.fullName ?? user.email ?? "P").slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text
                    style={{
                      color: "#f4f0e8",
                      fontSize: 16,
                      fontWeight: "700",
                    }}
                  >
                    {user.fullName ?? "Connected user"}
                  </Text>
                  <Text
                    style={{
                      color: "#bfd1ca",
                      fontSize: 13,
                    }}
                  >
                    {user.email ?? "Google account connected"}
                  </Text>
                </View>
              </View>

              <Pressable
                onPress={() => {
                  void handleReset();
                }}
                disabled={isResetting}
                style={{
                  borderRadius: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: "#0d302c",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                {isResetting ? <ActivityIndicator color="#f4f0e8" /> : null}
                <Text
                  style={{
                    color: "#f4f0e8",
                    fontWeight: "700",
                  }}
                >
                  {isResetting ? "Resetting..." : "Disconnect Google"}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text
                style={{
                  color: "#f4f0e8",
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                Connect Google to unlock your workspace
              </Text>
              <Text
                style={{
                  color: "#bfd1ca",
                  lineHeight: 20,
                }}
              >
                Productiv stores your goals, tasks, progress bars, and work logs
                against your Google-backed account.
              </Text>
              <Pressable
                onPress={() => {
                  void handleConnect();
                }}
                disabled={!isAuthReady || isConnecting}
                style={{
                  borderRadius: 16,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor:
                    !isAuthReady || isConnecting ? "#496964" : "#f0c15d",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
              >
                {isConnecting ? <ActivityIndicator color="#123a35" /> : null}
                <Text
                  style={{
                    color: "#123a35",
                    fontWeight: "700",
                  }}
                >
                  {!isAuthReady
                    ? "Checking session..."
                    : isConnecting
                      ? "Connecting..."
                      : "Connect Google"}
                </Text>
              </Pressable>
            </>
          )}

          {errorMessage ? (
            <Text
              style={{
                color: "#ffd2c7",
                fontSize: 13,
                lineHeight: 18,
              }}
            >
              {errorMessage}
            </Text>
          ) : null}
        </View>
      </View>

      <DrawerItemList {...props} />
    </DrawerContentScrollView>
  );
}
