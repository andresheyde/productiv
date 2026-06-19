import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePathname } from "expo-router";

import { useAuth } from "@/features/auth/AuthProvider";
import { connectGoogleCalendar } from "@/features/auth/googleAuth";
import type { AssistantTurnMode } from "@/features/assistant/types";
import { getSessionTokenFromUrl } from "@/features/schedule/utils/scheduleAuth";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";

type QuickAction = {
  label: string;
  mode: AssistantTurnMode;
  prompt: string;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Define a goal",
    mode: "chat",
    prompt: "I want to create a new goal around ",
  },
  {
    label: "Add a task",
    mode: "chat",
    prompt: "Add a task for me: ",
  },
  {
    label: "Log work",
    mode: "work_log",
    prompt: "I worked on ",
  },
  {
    label: "Update schedule",
    mode: "chat",
    prompt: "Please schedule this task on my calendar: ",
  },
];

export default function AssistantHomeScreen() {
  const pathname = usePathname();
  const { isAuthReady, isAuthenticated, refreshAuthState } = useAuth();
  const {
    errorMessage,
    isLoading,
    isSendingMessage,
    messages,
    sendAssistantTurn,
  } = useWorkspace();
  const [composerValue, setComposerValue] = useState("");
  const [composerMode, setComposerMode] = useState<AssistantTurnMode>("chat");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const statusLabel = useMemo(() => {
    if (!isAuthenticated) {
      return "Google connection required";
    }

    return composerMode === "work_log" ? "Work log mode" : "Chat mode";
  }, [composerMode, isAuthenticated]);

  async function handleConnect() {
    setConnectError(null);
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

        setConnectError(
          "Google authentication finished, but no session was created.",
        );
        return;
      }

      if (result.type === "cancel" || result.type === "dismiss") {
        setConnectError("Google authentication was cancelled.");
      }
    } catch (error) {
      setConnectError(
        error instanceof Error
          ? error.message
          : "Unable to start Google sign-in.",
      );
    } finally {
      setIsConnecting(false);
    }
  }

  async function handleSend() {
    const nextMessage = composerValue.trim();

    if (!nextMessage || isSendingMessage || !isAuthenticated) {
      return;
    }

    const nextMode = composerMode;
    setComposerValue("");
    setComposerMode("chat");

    const didSend = await sendAssistantTurn({
      message: nextMessage,
      mode: nextMode,
    });

    if (!didSend) {
      setComposerValue(nextMessage);
      setComposerMode(nextMode);
    }
  }

  function handleQuickAction(action: QuickAction) {
    setComposerMode(action.mode);
    setComposerValue((currentValue) =>
      getNextQuickActionComposerValue(currentValue, action),
    );
  }

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={{
        flex: 1,
        backgroundColor: "#f3efe6",
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flex: 1,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 10,
            gap: 12,
          }}
        >
          <View
            style={{
              padding: 16,
              borderRadius: 24,
              backgroundColor: "#fffaf2",
              borderWidth: 1,
              borderColor: "#dcd2c2",
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 6 }}>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "700",
                    color: "#132521",
                  }}
                >
                  Productiv Chat
                </Text>
                <Text
                  style={{
                    color: "#5a6762",
                    lineHeight: 20,
                  }}
                >
                  Use chat to define goals, add tasks, log work, update progress,
                  and place things on your calendar.
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor:
                    !isAuthenticated || composerMode === "work_log"
                      ? "#efe1bc"
                      : "#d7e7e1",
                }}
              >
                <Text
                  style={{
                    color: "#123a35",
                    fontWeight: "700",
                    fontSize: 12,
                  }}
                >
                  {statusLabel}
                </Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                gap: 10,
              }}
            >
              {QUICK_ACTIONS.map((action) => (
                <Pressable
                  key={action.label}
                  onPress={() => handleQuickAction(action)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    borderRadius: 16,
                    backgroundColor:
                      composerMode === action.mode &&
                      composerValue.startsWith(action.prompt)
                        ? "#123a35"
                        : "#efe9dd",
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "700",
                      color:
                        composerMode === action.mode &&
                        composerValue.startsWith(action.prompt)
                          ? "#f4f0e8"
                          : "#31413c",
                    }}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {!isAuthenticated ? (
            <View
              style={{
                borderRadius: 24,
                backgroundColor: "#123a35",
                padding: 18,
                gap: 12,
              }}
            >
              <Text
                style={{
                  color: "#f4f0e8",
                  fontSize: 18,
                  fontWeight: "700",
                }}
              >
                Connect Google to start chatting
              </Text>
              <Text
                style={{
                  color: "#bfd1ca",
                  lineHeight: 20,
                }}
              >
                Your assistant history, goals, tasks, work logs, and progress
                bars are stored against your Google-backed workspace.
              </Text>
              <Pressable
                onPress={() => {
                  void handleConnect();
                }}
                disabled={!isAuthReady || isConnecting}
                style={{
                  borderRadius: 16,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  backgroundColor:
                    !isAuthReady || isConnecting ? "#809891" : "#f0c15d",
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
              {connectError ? (
                <Text
                  style={{
                    color: "#ffd2c7",
                  }}
                >
                  {connectError}
                </Text>
              ) : null}
            </View>
          ) : null}

          {errorMessage ? (
            <Text
              style={{
                color: "#9f2f26",
                backgroundColor: "#fbe9e6",
                borderRadius: 16,
                padding: 12,
              }}
            >
              {errorMessage}
            </Text>
          ) : null}

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingBottom: 16,
              gap: 12,
            }}
          >
            {isLoading && messages.length === 0 ? (
              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 48,
                }}
              >
                <ActivityIndicator size="large" color="#123a35" />
              </View>
            ) : null}

            {messages.length === 0 && isAuthenticated && !isLoading ? (
              <View
                style={{
                  padding: 20,
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: "#ddd3c3",
                  backgroundColor: "#fffaf2",
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    color: "#132521",
                    fontSize: 18,
                    fontWeight: "700",
                  }}
                >
                  Start by telling Productiv what you want to move forward.
                </Text>
                <Text
                  style={{
                    color: "#5a6762",
                    lineHeight: 22,
                  }}
                >
                  Example: “I want to land a backend role in three months, keep
                  my current job afloat, and track how many interview questions I
                  complete each week.”
                </Text>
              </View>
            ) : null}

            {messages.map((message) => (
              <View
                key={message.id}
                style={{
                  alignSelf:
                    message.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "92%",
                  borderRadius: 22,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  backgroundColor:
                    message.role === "user" ? "#123a35" : "#fffaf2",
                  borderWidth: message.role === "assistant" ? 1 : 0,
                  borderColor: "#ddd3c3",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    letterSpacing: 0.6,
                    textTransform: "uppercase",
                    marginBottom: 8,
                    color:
                      message.role === "user" ? "#bfd1ca" : "#65716d",
                  }}
                >
                  {message.role === "user" ? "You" : "Productiv"}
                </Text>
                <Text
                  style={{
                    color:
                      message.role === "user" ? "#f4f0e8" : "#162a26",
                    lineHeight: 22,
                  }}
                >
                  {message.content}
                </Text>
              </View>
            ))}

            {isSendingMessage ? (
              <View
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderRadius: 22,
                  borderWidth: 1,
                  borderColor: "#ddd3c3",
                  backgroundColor: "#fffaf2",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <ActivityIndicator color="#123a35" />
                <Text
                  style={{
                    color: "#5a6762",
                  }}
                >
                  Thinking through the next move...
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View
            style={{
              borderRadius: 24,
              backgroundColor: "#fffaf2",
              borderWidth: 1,
              borderColor: "#dcd2c2",
              padding: 14,
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  color: "#5a6762",
                  fontWeight: "700",
                }}
              >
                {composerMode === "work_log"
                  ? "Work log extraction is on"
                  : "Chat mode is on"}
              </Text>
              {composerMode === "work_log" ? (
                <Pressable
                  onPress={() => setComposerMode("chat")}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: "#efe9dd",
                  }}
                >
                  <Text
                    style={{
                      color: "#31413c",
                      fontWeight: "700",
                    }}
                  >
                    Switch to chat
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <TextInput
              value={composerValue}
              onChangeText={setComposerValue}
              editable={isAuthenticated && !isSendingMessage}
              multiline
              placeholder={
                composerMode === "work_log"
                  ? "Log what you worked on and include the amount if you want progress extracted..."
                  : "Message Productiv..."
              }
              placeholderTextColor="#88938f"
              style={{
                minHeight: 110,
                borderRadius: 18,
                backgroundColor: "#f6f1e8",
                paddingHorizontal: 14,
                paddingVertical: 14,
                textAlignVertical: "top",
                color: "#162a26",
              }}
            />

            <Pressable
              onPress={() => {
                void handleSend();
              }}
              disabled={
                !isAuthenticated ||
                isSendingMessage ||
                composerValue.trim().length === 0
              }
              style={{
                borderRadius: 18,
                paddingHorizontal: 16,
                paddingVertical: 16,
                alignItems: "center",
                backgroundColor:
                  !isAuthenticated ||
                  isSendingMessage ||
                  composerValue.trim().length === 0
                    ? "#cdd6d2"
                    : "#123a35",
              }}
            >
              <Text
                style={{
                  color: "#f4f0e8",
                  fontWeight: "700",
                  fontSize: 15,
                }}
              >
                Send
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getNextQuickActionComposerValue(
  currentValue: string,
  action: QuickAction,
) {
  const currentQuickAction = QUICK_ACTIONS.find((quickAction) =>
    currentValue.startsWith(quickAction.prompt),
  );

  if (currentQuickAction) {
    return `${action.prompt}${currentValue.slice(currentQuickAction.prompt.length)}`;
  }

  return currentValue.trim().length > 0 ? currentValue : action.prompt;
}
