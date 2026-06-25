import {
  addDays,
  differenceInCalendarDays,
  startOfDay,
} from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePathname } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "@/features/auth/AuthProvider";
import {
  canScrollProposalPreviewTimedGrid,
  getProposalPreviewDayCount,
  getProposalPreviewDayWidth,
  getProposalPreviewEventsInRange,
  getProposalPreviewGridWidth,
  getProposalPreviewTimedViewportHeight,
  getProposalPreviewTimeWindow,
  getProposalPreviewTimedEventLayouts,
  isProposalPreviewEventInDay,
  PROPOSAL_PREVIEW_DAY_COLUMN_GAP as PREVIEW_DAY_COLUMN_GAP,
  PROPOSAL_PREVIEW_HORIZONTAL_PADDING as PREVIEW_HORIZONTAL_PADDING,
  PROPOSAL_PREVIEW_TIME_GUTTER_WIDTH as PREVIEW_TIME_GUTTER_WIDTH,
  type ProposalPreviewTimedEventLayout,
} from "@/features/assistant/layout/proposalPreviewLayout";
import {
  getRenderableScheduleProposals,
  getScheduleProposalConflictNotice,
  shouldRenderScheduleProposalMessageContent,
} from "@/features/assistant/layout/scheduleProposalRendering";
import { connectGoogleCalendar } from "@/features/auth/googleAuth";
import { fetchScheduleEvents } from "@/features/schedule/api/scheduleApi";
import { formatLocaleDate } from "@/features/shared/utils/dateTime";
import type {
  AssistantMessage,
  AssistantTurnMode,
  ScheduleProposal,
} from "@/features/assistant/types";
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
  {
    label: "Reflect on schedule",
    mode: "schedule_reflection",
    prompt:
      "I want to reflect on my schedule. What worked was ..., what didn't work was ..., and what got in the way was ...",
  },
];

export default function AssistantHomeScreen() {
  const pathname = usePathname();
  const { isAuthReady, isAuthenticated, refreshAuthState } = useAuth();
  const {
    activeThread,
    createThread,
    deleteThread,
    errorMessage,
    isLoading,
    isSendingMessage,
    messages,
    selectThread,
    sendAssistantTurn,
    threads,
  } = useWorkspace();
  const [composerValue, setComposerValue] = useState("");
  const [composerMode, setComposerMode] = useState<AssistantTurnMode>("chat");
  const [deleteConfirmThreadId, setDeleteConfirmThreadId] = useState<string | null>(
    null,
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [actedProposalIds, setActedProposalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const messageScrollViewRef = useRef<ScrollView | null>(null);
  const latestScheduleProposalsById = useMemo(
    () => getLatestScheduleProposalsById(messages),
    [messages],
  );
  const pendingScheduleProposal = useMemo(
    () =>
      getLatestDraftScheduleProposal(
        messages,
        actedProposalIds,
        latestScheduleProposalsById,
      ),
    [actedProposalIds, latestScheduleProposalsById, messages],
  );
  const latestMessageId = messages.at(-1)?.id ?? null;

  const statusLabel = useMemo(() => {
    if (!isAuthenticated) {
      return "Google connection required";
    }

    if (composerMode === "work_log") {
      return "Work log mode";
    }

    if (composerMode === "schedule_reflection") {
      return "Schedule reflection mode";
    }

    return "Chat mode";
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

    if (pendingScheduleProposal) {
      setComposerValue("");
      setComposerMode("chat");

      const didSend = await handleProposalFeedback(
        pendingScheduleProposal,
        nextMessage,
      );

      if (!didSend) {
        setComposerValue(nextMessage);
      }

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

  useEffect(() => {
    messageScrollViewRef.current?.scrollToEnd({ animated: true });
  }, [latestMessageId, pendingScheduleProposal?.id]);

  async function handleCreateThread() {
    if (isLoading || isSendingMessage) {
      return;
    }

    setDeleteConfirmThreadId(null);
    await createThread();
  }

  async function handleSelectThread(threadId: string) {
    if (threadId === activeThread?.id || isLoading || isSendingMessage) {
      return;
    }

    setDeleteConfirmThreadId(null);
    await selectThread(threadId);
  }

  async function handleDeleteActiveThread() {
    if (!activeThread || isLoading || isSendingMessage) {
      return;
    }

    if (deleteConfirmThreadId !== activeThread.id) {
      setDeleteConfirmThreadId(activeThread.id);
      return;
    }

    setDeleteConfirmThreadId(null);
    await deleteThread(activeThread.id);
  }

  async function handleProposalDecision(proposal: ScheduleProposal) {
    if (isSendingMessage || actedProposalIds.has(proposal.id)) {
      return;
    }

    setActedProposalIds((currentIds) => new Set(currentIds).add(proposal.id));

    const didSend = await sendAssistantTurn({
      message: `Confirm schedule proposal ${proposal.id}.`,
      mode: "chat",
    });

    if (didSend) {
      setComposerValue("");
      return;
    }

    setActedProposalIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(proposal.id);
      return nextIds;
    });
  }

  async function handleProposalFeedback(
    proposal: ScheduleProposal,
    feedbackValue: string,
  ) {
    if (isSendingMessage || actedProposalIds.has(proposal.id)) {
      return false;
    }

    const feedback = feedbackValue.trim();

    if (!feedback) {
      return false;
    }

    setActedProposalIds((currentIds) => new Set(currentIds).add(proposal.id));

    const didSend = await sendAssistantTurn({
      message: [
        `For schedule proposal ${proposal.id}, please revise it based on this feedback:`,
        feedback,
      ].join(" "),
      mode: "chat",
    });

    if (didSend) {
      return true;
    }

    setActedProposalIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(proposal.id);
      return nextIds;
    });
    return false;
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
          {isAuthenticated ? (
            <View
              style={{
                borderRadius: 18,
                backgroundColor: "#fffaf2",
                borderWidth: 1,
                borderColor: "#dcd2c2",
                paddingHorizontal: 12,
                paddingVertical: 10,
                gap: 10,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <Text
                  style={{
                    color: "#31413c",
                    fontSize: 12,
                    fontWeight: "800",
                    textTransform: "uppercase",
                  }}
                >
                  Chats
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 8,
                  }}
                >
                  <Pressable
                    onPress={() => {
                      void handleCreateThread();
                    }}
                    disabled={isLoading || isSendingMessage}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 12,
                      backgroundColor:
                        isLoading || isSendingMessage ? "#d6d0c6" : "#123a35",
                    }}
                  >
                    <Text
                      style={{
                        color: "#f4f0e8",
                        fontWeight: "800",
                      }}
                    >
                      New chat
                    </Text>
                  </Pressable>
                  {activeThread ? (
                    <Pressable
                      onPress={() => {
                        void handleDeleteActiveThread();
                      }}
                      disabled={isLoading || isSendingMessage}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        borderRadius: 12,
                        backgroundColor:
                          deleteConfirmThreadId === activeThread.id
                            ? "#f5c8c1"
                            : "#efe9dd",
                      }}
                    >
                      <Text
                        style={{
                          color:
                            deleteConfirmThreadId === activeThread.id
                              ? "#7f2d24"
                              : "#31413c",
                          fontWeight: "800",
                        }}
                      >
                        {deleteConfirmThreadId === activeThread.id
                          ? "Confirm delete"
                          : "Delete chat"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  gap: 8,
                  paddingRight: 4,
                }}
              >
                {threads.length === 0 ? (
                  <Text
                    style={{
                      color: "#5a6762",
                      lineHeight: 20,
                    }}
                  >
                    Start a new chat or send a message to create one.
                  </Text>
                ) : null}
                {threads.map((threadItem) => {
                  const isActiveThread = threadItem.id === activeThread?.id;

                  return (
                    <Pressable
                      key={threadItem.id}
                      onPress={() => {
                        void handleSelectThread(threadItem.id);
                      }}
                      disabled={isLoading || isSendingMessage}
                      style={{
                        width: 170,
                        minHeight: 54,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: isActiveThread ? "#123a35" : "#d8cfbf",
                        backgroundColor: isActiveThread ? "#d7e7e1" : "#f6f1e8",
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        gap: 2,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{
                          color: "#132521",
                          fontWeight: "800",
                        }}
                      >
                        {threadItem.title}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{
                          color: "#5a6762",
                          fontSize: 12,
                        }}
                      >
                        {formatThreadUpdatedAt(threadItem.updatedAt)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

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
            ref={messageScrollViewRef}
            testID="assistant-message-scroll"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              messageScrollViewRef.current?.scrollToEnd({ animated: false });
            }}
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
              <AssistantChatMessage
                key={message.id}
                latestScheduleProposalsById={latestScheduleProposalsById}
                message={message}
              />
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

          {pendingScheduleProposal ? (
            <ProposalActionPrompt
              hasActed={actedProposalIds.has(pendingScheduleProposal.id)}
              isSendingMessage={isSendingMessage}
              onImplement={() => {
                void handleProposalDecision(pendingScheduleProposal);
              }}
              proposal={pendingScheduleProposal}
            />
          ) : null}

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
                {pendingScheduleProposal
                  ? "Need a change? Tell Productiv below"
                  : composerMode === "work_log"
                    ? "Work log extraction is on"
                    : composerMode === "schedule_reflection"
                      ? "Schedule reflection is on"
                    : "Chat mode is on"}
              </Text>
              {!pendingScheduleProposal && composerMode !== "chat" ? (
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

            {!pendingScheduleProposal ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  gap: 8,
                  paddingRight: 2,
                }}
              >
                {QUICK_ACTIONS.map((action) => {
                  const isSelected =
                    composerMode === action.mode &&
                    composerValue.startsWith(action.prompt);

                  return (
                    <Pressable
                      key={action.label}
                      onPress={() => handleQuickAction(action)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        borderRadius: 14,
                        backgroundColor: isSelected ? "#123a35" : "#efe9dd",
                      }}
                    >
                      <Text
                        style={{
                          fontWeight: "700",
                          color: isSelected ? "#f4f0e8" : "#31413c",
                        }}
                      >
                        {action.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <TextInput
              value={composerValue}
              onChangeText={setComposerValue}
              editable={isAuthenticated && !isSendingMessage}
              multiline
              placeholder={
                pendingScheduleProposal
                  ? "Move Friday study later, make mornings lighter..."
                  : composerMode === "work_log"
                    ? "Log what you worked on and include the amount if you want progress extracted..."
                    : composerMode === "schedule_reflection"
                      ? "What worked, what didn't, and what got in the way?"
                    : "Message Productiv..."
              }
              placeholderTextColor="#88938f"
              style={{
                minHeight: 88,
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
              <View
                style={{
                  alignItems: "center",
                  flexDirection: "row",
                  gap: 8,
                }}
              >
                <Ionicons
                  name="send"
                  size={16}
                  color="#f4f0e8"
                />
                <Text
                  style={{
                    color: "#f4f0e8",
                    fontWeight: "700",
                    fontSize: 15,
                  }}
                >
                  {pendingScheduleProposal ? "Send feedback" : "Send"}
                </Text>
              </View>
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

function formatThreadUpdatedAt(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "Recent chat";
  }

  return `Updated ${formatLocaleDate(parsed, {
    month: "short",
    day: "numeric",
  })}`;
}

function AssistantChatMessage({
  latestScheduleProposalsById,
  message,
}: {
  latestScheduleProposalsById: Map<string, ScheduleProposal>;
  message: AssistantMessage;
}) {
  const scheduleProposals = getMessageScheduleProposals(
    message,
    latestScheduleProposalsById,
  );
  const shouldRenderMessageContent = shouldRenderScheduleProposalMessageContent({
    role: message.role,
    scheduleProposalCount: scheduleProposals.length,
  });

  if (!shouldRenderMessageContent) {
    return (
      <View
        style={{
          alignSelf: "flex-start",
          maxWidth: "100%",
          width: "100%",
          gap: 14,
        }}
      >
        {scheduleProposals.map((proposal) => (
          <ScheduleProposalCard key={proposal.id} proposal={proposal} />
        ))}
      </View>
    );
  }

  return (
    <View
      style={{
        alignSelf: message.role === "user" ? "flex-end" : "flex-start",
        maxWidth: message.role === "assistant" && scheduleProposals.length > 0
          ? "100%"
          : "92%",
        borderRadius: 22,
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: message.role === "user" ? "#123a35" : "#fffaf2",
        borderWidth: message.role === "assistant" ? 1 : 0,
        borderColor: "#ddd3c3",
        gap: scheduleProposals.length > 0 ? 14 : 0,
      }}
    >
      <View>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 0.6,
            textTransform: "uppercase",
            marginBottom: 8,
            color: message.role === "user" ? "#bfd1ca" : "#65716d",
          }}
        >
          {message.role === "user" ? "You" : "Productiv"}
        </Text>
        <Text
          style={{
            color: message.role === "user" ? "#f4f0e8" : "#162a26",
            lineHeight: 22,
          }}
        >
          {message.content}
        </Text>
      </View>

      {scheduleProposals.map((proposal) => (
        <ScheduleProposalCard key={proposal.id} proposal={proposal} />
      ))}
    </View>
  );
}

function ScheduleProposalCard({ proposal }: { proposal: ScheduleProposal }) {
  const conflictNotice = getScheduleProposalConflictNotice({
    conflictAnnotations: proposal.conflictAnnotations,
  });

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#cfd8d3",
        backgroundColor: "#f6f1e8",
        overflow: "hidden",
      }}
    >
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: "#132521",
              flex: 1,
              fontSize: 16,
              fontWeight: "800",
            }}
          >
            {getProposalCardTitle(proposal)}
          </Text>
          <View
            style={{
              borderRadius: 999,
              backgroundColor: getProposalStatusColor(proposal.status),
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text
              style={{
                color: "#123a35",
                fontSize: 11,
                fontWeight: "800",
                textTransform: "uppercase",
              }}
            >
              {proposal.status}
            </Text>
          </View>
        </View>
        {conflictNotice ? (
          <View
            style={{
              alignItems: "flex-start",
              backgroundColor: "#fff4d0",
              borderColor: "#e2bc56",
              borderRadius: 12,
              borderWidth: 1,
              flexDirection: "row",
              gap: 8,
              marginTop: 10,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          >
            <Ionicons name="warning" size={15} color="#805d08" />
            <Text
              numberOfLines={2}
              style={{
                color: "#59420a",
                flex: 1,
                fontSize: 12,
                fontWeight: "800",
                lineHeight: 16,
              }}
            >
              {conflictNotice}
            </Text>
          </View>
        ) : null}
      </View>

      <ScheduleProposalWeekPreview proposal={proposal} />
    </View>
  );
}

function ProposalActionPrompt({
  hasActed,
  isSendingMessage,
  onImplement,
  proposal,
}: {
  hasActed: boolean;
  isSendingMessage: boolean;
  onImplement: () => void;
  proposal: ScheduleProposal;
}) {
  const { width } = useWindowDimensions();
  const canAct = proposal.status === "draft" && !hasActed && !isSendingMessage;
  const heading = getProposalActionHeading(proposal);
  const subtitle = getProposalActionSubtitle(proposal);
  const shouldStack = width < 430;

  return (
    <View
      testID="proposal-action-prompt"
      style={{
        borderRadius: 22,
        backgroundColor: "#123a35",
        padding: 14,
        gap: 12,
      }}
    >
      <View
        style={{
          flexDirection: shouldStack ? "column" : "row",
          alignItems: shouldStack ? "stretch" : "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 3 }}>
          <Text
            style={{
              color: "#f4f0e8",
              fontSize: 15,
              fontWeight: "800",
            }}
            numberOfLines={1}
          >
            {heading}
          </Text>
          <Text
            style={{
              color: "#bfd1ca",
              fontSize: 12,
              fontWeight: "700",
              lineHeight: 16,
            }}
            numberOfLines={2}
          >
            {subtitle}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Implement proposed schedule"
          accessibilityRole="button"
          onPress={onImplement}
          disabled={!canAct}
          style={{
            alignItems: "center",
            borderRadius: 16,
            backgroundColor: canAct ? "#f0c15d" : "#809891",
            flexDirection: "row",
            flexShrink: 0,
            gap: 6,
            justifyContent: "center",
            minWidth: 142,
            paddingHorizontal: 14,
            paddingVertical: 12,
            width: shouldStack ? "100%" : undefined,
          }}
        >
          <Ionicons
            name={hasActed ? "checkmark-done" : "checkmark"}
            size={17}
            color="#123a35"
          />
          <Text
            numberOfLines={1}
            style={{
              color: "#123a35",
              fontWeight: "800",
              textAlign: "center",
            }}
          >
            {hasActed ? "Sent" : "Yes, implement"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

type ProposalPreviewEvent = {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  source: "calendar" | "proposal";
  calendarName?: string;
};

const PREVIEW_HOUR_HEIGHT = 46;

function ScheduleProposalWeekPreview({
  proposal,
}: {
  proposal: ScheduleProposal;
}) {
  const { isAuthenticated, sessionToken } = useAuth();
  const { width: viewportWidth } = useWindowDimensions();
  const [previewWidth, setPreviewWidth] = useState(0);
  const range = useMemo(() => getProposalPreviewRange(proposal), [proposal]);
  const rangeKey = range
    ? `${range.startDate.toISOString()}:${range.endDate.toISOString()}`
    : "";
  const [calendarEvents, setCalendarEvents] = useState<ProposalPreviewEvent[]>(
    [],
  );
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewStartDayIndex, setPreviewStartDayIndex] = useState(0);
  const measuredPreviewWidth = previewWidth > 0 ? previewWidth : viewportWidth;
  const visibleDayCount = getProposalPreviewDayCount(measuredPreviewWidth);

  useEffect(() => {
    if (!range || !isAuthenticated) {
      setCalendarEvents([]);
      setPreviewError(null);
      return;
    }

    let isCanceled = false;
    setIsLoadingPreview(true);
    setPreviewError(null);

    fetchScheduleEvents(range.startDate, range.endDate, sessionToken)
      .then((events) => {
        if (isCanceled) {
          return;
        }

        setCalendarEvents(
          events.map((event) => ({
            id: `calendar:${event.sourceCalendarId}:${event.id}`,
            title: event.title,
            startTime: event.startTime,
            endTime: event.endTime,
            allDay: event.allDay,
            source: "calendar" as const,
            calendarName: event.sourceCalendarName,
          })),
        );
      })
      .catch((error) => {
        if (!isCanceled) {
          setCalendarEvents([]);
          setPreviewError(
            error instanceof Error ? error.message : "Preview unavailable.",
          );
        }
      })
      .finally(() => {
        if (!isCanceled) {
          setIsLoadingPreview(false);
        }
      });

    return () => {
      isCanceled = true;
    };
  }, [isAuthenticated, rangeKey, sessionToken]);

  const proposalEvents = useMemo(
    () => getProposalPreviewEvents(proposal),
    [proposal],
  );

  useEffect(() => {
    setPreviewStartDayIndex(0);
  }, [rangeKey, visibleDayCount]);

  if (!range) {
    return null;
  }

  const days = Array.from({ length: range.dayCount }, (_, index) =>
    addDays(range.startDate, index),
  );
  const previewEvents = [...calendarEvents, ...proposalEvents];
  const renderedDayCount = Math.min(days.length, visibleDayCount);
  const maxPreviewStartDayIndex = Math.max(0, days.length - renderedDayCount);
  const currentPreviewStartDayIndex = Math.min(
    previewStartDayIndex,
    maxPreviewStartDayIndex,
  );
  const visibleDays = days.slice(
    currentPreviewStartDayIndex,
    currentPreviewStartDayIndex + renderedDayCount,
  );
  const visibleRangeStartDate = visibleDays[0] ?? range.startDate;
  const visibleRangeEndDate = visibleDays.at(-1) ?? range.endDate;
  const visiblePreviewEvents = getProposalPreviewEventsInRange(
    previewEvents,
    visibleRangeStartDate,
    renderedDayCount,
  );
  const allDayEvents = visiblePreviewEvents.filter((event) => event.allDay);
  const timedEvents = visiblePreviewEvents.filter((event) => !event.allDay);
  const timeWindow = getProposalPreviewTimeWindow(timedEvents);
  const canPagePreviewDays = days.length > renderedDayCount;
  const dayWidth = getProposalPreviewDayWidth(
    measuredPreviewWidth,
    renderedDayCount,
  );
  const previewGridWidth = getProposalPreviewGridWidth(
    dayWidth,
    renderedDayCount,
  );
  const canScrollPreviewGrid = previewGridWidth > measuredPreviewWidth + 1;
  const timedHeight =
    (timeWindow.endHour - timeWindow.startHour) * PREVIEW_HOUR_HEIGHT;
  const timedViewportHeight = getProposalPreviewTimedViewportHeight(
    timedHeight,
    renderedDayCount,
  );
  const canScrollTimedGrid = canScrollProposalPreviewTimedGrid(
    timedHeight,
    renderedDayCount,
  );

  function handlePreviewLayout(event: LayoutChangeEvent) {
    const nextWidth = event.nativeEvent.layout.width;

    setPreviewWidth((currentWidth) =>
      Math.abs(currentWidth - nextWidth) > 1 ? nextWidth : currentWidth,
    );
  }

  return (
    <View
      testID="schedule-proposal-preview"
      onLayout={handlePreviewLayout}
      style={{
        borderTopWidth: 1,
        borderColor: "#ddd3c3",
        backgroundColor: "#fffaf2",
        paddingVertical: 12,
        gap: 10,
      }}
    >
      <View
        style={{
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              color: "#132521",
              fontWeight: "800",
            }}
          >
            {formatPreviewRange(visibleRangeStartDate, visibleRangeEndDate)}
          </Text>
          {canPagePreviewDays ? (
            <Text
              style={{
                color: "#68736f",
                fontSize: 11,
                fontWeight: "700",
                marginTop: 2,
              }}
            >
              {currentPreviewStartDayIndex + 1}-
              {currentPreviewStartDayIndex + visibleDays.length} of{" "}
              {days.length} days
            </Text>
          ) : null}
        </View>
        {canPagePreviewDays ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            <PreviewDayNavButton
              direction="previous"
              disabled={currentPreviewStartDayIndex === 0}
              onPress={() => {
                setPreviewStartDayIndex((index) =>
                  Math.max(0, index - renderedDayCount),
                );
              }}
            />
            <PreviewDayNavButton
              direction="next"
              disabled={
                currentPreviewStartDayIndex >= maxPreviewStartDayIndex
              }
              onPress={() => {
                setPreviewStartDayIndex((index) =>
                  Math.min(
                    maxPreviewStartDayIndex,
                    index + renderedDayCount,
                  ),
                );
              }}
            />
          </View>
        ) : null}
        <View
          style={{
            alignItems: "center",
            borderRadius: 999,
            backgroundColor: "#e7efe9",
            paddingHorizontal: 9,
            paddingVertical: 6,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: "#31413c",
              fontSize: 11,
              fontWeight: "800",
            }}
          >
            {isLoadingPreview ? "Loading" : `${proposalEvents.length} proposed`}
          </Text>
        </View>
      </View>

      {previewError ? (
        <Text
          style={{
            color: "#8a3a2f",
            paddingHorizontal: 14,
            lineHeight: 18,
          }}
        >
          {previewError}
        </Text>
      ) : null}

      {allDayEvents.length > 0 ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: PREVIEW_HORIZONTAL_PADDING,
            gap: 8,
          }}
        >
          {allDayEvents.slice(0, 8).map((event) => (
            <View
              key={event.id}
              style={{
                borderRadius: 999,
                backgroundColor:
                  event.source === "proposal" ? "#fde7a1" : "#eef1ef",
                borderWidth: 1,
                borderColor:
                  event.source === "proposal" ? "#d29d12" : "#d3d8d5",
                paddingHorizontal: 10,
                paddingVertical: 7,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  color: "#132521",
                  fontSize: 12,
                  fontWeight: "800",
                }}
              >
                {event.title}
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <ScrollView
        nestedScrollEnabled
        scrollEnabled={canScrollTimedGrid}
        showsVerticalScrollIndicator={canScrollTimedGrid}
        style={{
          maxHeight: timedViewportHeight,
        }}
      >
        <ScrollView
          horizontal
          nestedScrollEnabled
          scrollEnabled={canScrollPreviewGrid}
          showsHorizontalScrollIndicator={canScrollPreviewGrid}
          contentContainerStyle={{
            paddingHorizontal: PREVIEW_HORIZONTAL_PADDING,
          }}
        >
          <View>
            <View style={{ flexDirection: "row" }}>
              <View
                style={{
                  width: PREVIEW_TIME_GUTTER_WIDTH,
                  paddingBottom: 8,
                }}
              />
              {visibleDays.map((day) => (
                <View
                  key={day.toISOString()}
                  style={{
                    width: dayWidth,
                    marginRight: PREVIEW_DAY_COLUMN_GAP,
                    paddingBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      color: "#132521",
                      fontSize: 12,
                      fontWeight: "800",
                    }}
                  >
                    {formatPreviewDay(day)}
                  </Text>
                </View>
              ))}
            </View>
            <View
              style={{
                flexDirection: "row",
                height: timedHeight,
              }}
            >
              <View
                style={{
                  width: PREVIEW_TIME_GUTTER_WIDTH,
                  height: timedHeight,
                }}
              >
                {Array.from(
                  { length: timeWindow.endHour - timeWindow.startHour + 1 },
                  (_, index) => timeWindow.startHour + index,
                ).map((hour) => (
                  <Text
                    key={hour}
                    style={{
                      color: "#7a8580",
                      fontSize: 10,
                      fontWeight: "700",
                      position: "absolute",
                      top: Math.max(
                        0,
                        (hour - timeWindow.startHour) * PREVIEW_HOUR_HEIGHT - 7,
                      ),
                    }}
                  >
                    {formatPreviewHour(hour)}
                  </Text>
                ))}
              </View>
              {visibleDays.map((day) => (
                <View
                  key={`${day.toISOString()}-body`}
                  style={{
                    width: dayWidth,
                    marginRight: PREVIEW_DAY_COLUMN_GAP,
                    height: timedHeight,
                    borderLeftWidth: 1,
                    borderColor: "#e8ded0",
                  }}
                >
                  {getProposalPreviewTimedEventLayouts(
                    timedEvents.filter((event) =>
                      isProposalPreviewEventInDay(event, day),
                    ),
                    day,
                    timeWindow,
                    PREVIEW_HOUR_HEIGHT,
                  ).map((layout) => (
                    <PreviewEventBlock
                      key={`${layout.event.id}:${day.toISOString()}`}
                      dayWidth={dayWidth}
                      layout={layout}
                    />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

function PreviewDayNavButton({
  direction,
  disabled,
  onPress,
}: {
  direction: "next" | "previous";
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={
        direction === "previous"
          ? "Previous proposal days"
          : "Next proposal days"
      }
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        width: 30,
        height: 30,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 15,
        backgroundColor: disabled ? "#efe9dd" : "#d7e7e1",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Ionicons
        name={direction === "previous" ? "chevron-back" : "chevron-forward"}
        size={17}
        color="#123a35"
      />
    </Pressable>
  );
}

function PreviewEventBlock({
  dayWidth,
  layout,
}: {
  dayWidth: number;
  layout: ProposalPreviewTimedEventLayout<ProposalPreviewEvent>;
}) {
  const event = layout.event;
  const isCompact = layout.visibleMinutes < 45 || layout.laneCount > 1;
  const isProposal = event.source === "proposal";
  const laneAvailableWidth = Math.max(1, dayWidth);
  const laneWidth = laneAvailableWidth / layout.laneCount;
  const laneLeft = laneWidth * layout.laneIndex;

  return (
    <View
      style={{
        position: "absolute",
        left: laneLeft,
        width: laneWidth,
        top: layout.top,
        height: layout.height,
        paddingLeft: layout.laneIndex === 0 ? 4 : 2,
        paddingRight: layout.laneIndex === layout.laneCount - 1 ? 10 : 2,
      }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: isProposal ? "#d29d12" : "#aebbb5",
          backgroundColor: isProposal ? "#fde7a1" : "#e8efec",
          paddingHorizontal: 6,
          paddingVertical: isCompact ? 4 : 5,
          overflow: "hidden",
        }}
      >
        {isCompact ? (
          <Text
            numberOfLines={1}
            style={{
              color: "#132521",
              fontSize: 10,
              fontWeight: "800",
              lineHeight: 12,
            }}
          >
            {formatPreviewEventTime(event)} {event.title}
          </Text>
        ) : (
          <>
            <Text
              numberOfLines={1}
              style={{
                color: "#586660",
                fontSize: 9,
                fontWeight: "800",
                lineHeight: 10,
              }}
            >
              {formatPreviewEventTime(event)}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: "#132521",
                fontSize: 11,
                fontWeight: "800",
                lineHeight: 13,
              }}
            >
              {event.title}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

function getMessageScheduleProposals(
  message: AssistantMessage,
  latestScheduleProposalsById?: Map<string, ScheduleProposal>,
) {
  if (message.role !== "assistant") {
    return [];
  }

  const proposalsById = getRawMessageScheduleProposalsById(message);
  return getRenderableScheduleProposals(
    Array.from(proposalsById.values()),
    latestScheduleProposalsById,
  );
}

function getRawMessageScheduleProposalsById(message: AssistantMessage) {
  const proposalsById = new Map<string, ScheduleProposal>();

  if (message.role !== "assistant") {
    return proposalsById;
  }

  const payload = message.structuredPayload;
  getScheduleProposalArray(payload.scheduleProposals).forEach((proposal) => {
    proposalsById.set(proposal.id, proposal);
  });

  if (
    payload.sideEffects &&
    typeof payload.sideEffects === "object" &&
    !Array.isArray(payload.sideEffects)
  ) {
    getScheduleProposalArray(
      (payload.sideEffects as Record<string, unknown>).scheduleProposals,
    ).forEach((proposal) => {
      proposalsById.set(proposal.id, proposal);
    });
  }

  return proposalsById;
}

function getProposalActionHeading(proposal: ScheduleProposal) {
  const blockCount = proposal.operations.length;

  if (blockCount === 0) {
    return "Ready to schedule?";
  }

  return `Ready to schedule ${blockCount} block${blockCount === 1 ? "" : "s"}?`;
}

function getProposalCardTitle(proposal: ScheduleProposal) {
  if (proposal.status === "applied" || proposal.status === "confirmed") {
    return "Schedule implemented";
  }

  return "Proposed schedule";
}

function getProposalActionSubtitle(proposal: ScheduleProposal) {
  const titleSummary = getProposalOperationTitleSummary(proposal);
  const dateSummary = getProposalOperationDateSummary(proposal);

  if (titleSummary && dateSummary) {
    return `${titleSummary} • ${dateSummary}`;
  }

  return titleSummary || dateSummary || proposal.title;
}

function getProposalOperationTitleSummary(proposal: ScheduleProposal) {
  const titles = [
    ...new Set(
      proposal.operations
        .map((operation) => operation.title.trim())
        .filter((title) => title.length > 0),
    ),
  ];

  if (titles.length === 0) {
    return "";
  }

  if (titles.length === 1) {
    return titles[0] ?? "";
  }

  if (titles.length === 2) {
    return `${titles[0]} + ${titles[1]}`;
  }

  return `${titles[0]} + ${titles.length - 1} more`;
}

function getProposalOperationDateSummary(proposal: ScheduleProposal) {
  const startTimes = proposal.operations
    .map((operation) => new Date(operation.startTime))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());
  const firstStartTime = startTimes[0];
  const lastStartTime = startTimes.at(-1);

  if (!firstStartTime || !lastStartTime) {
    return "";
  }

  const firstLabel = formatProposalDateLabel(firstStartTime);
  const lastLabel = formatProposalDateLabel(lastStartTime);

  return firstLabel === lastLabel ? firstLabel : `${firstLabel}-${lastLabel}`;
}

function formatProposalDateLabel(date: Date) {
  return formatLocaleDate(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getLatestScheduleProposalsById(messages: AssistantMessage[]) {
  const proposalsById = new Map<string, ScheduleProposal>();

  for (const message of messages) {
    getRawMessageScheduleProposalsById(message).forEach((proposal) => {
      proposalsById.set(proposal.id, proposal);
    });
  }

  return proposalsById;
}

function getLatestDraftScheduleProposal(
  messages: AssistantMessage[],
  actedProposalIds: Set<string>,
  latestScheduleProposalsById: Map<string, ScheduleProposal>,
) {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex -= 1
  ) {
    const message = messages[messageIndex];

    if (!message) {
      continue;
    }

    const proposal = getMessageScheduleProposals(
      message,
      latestScheduleProposalsById,
    )
      .slice()
      .reverse()
      .find(
        (candidate) =>
          candidate.status === "draft" && !actedProposalIds.has(candidate.id),
      );

    if (proposal) {
      return proposal;
    }
  }

  return null;
}

function getScheduleProposalArray(value: unknown): ScheduleProposal[] {
  return Array.isArray(value)
    ? value.flatMap((item) => normalizeScheduleProposal(item))
    : [];
}

function normalizeScheduleProposal(value: unknown): ScheduleProposal[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.id !== "string" ||
    typeof record.title !== "string" ||
    typeof record.status !== "string" ||
    typeof record.summary !== "string"
  ) {
    return [];
  }

  return [
    {
      id: record.id,
      threadId: typeof record.threadId === "string" ? record.threadId : null,
      title: record.title,
      status: normalizeProposalStatus(record.status),
      intent: typeof record.intent === "string" ? record.intent : null,
      summary: record.summary,
      operations: normalizeProposalOperations(record.operations),
      conflictAnnotations: normalizeProposalConflicts(record.conflictAnnotations),
      feedbackHistory: Array.isArray(record.feedbackHistory)
        ? record.feedbackHistory.filter(
            (item): item is Record<string, unknown> =>
              !!item && typeof item === "object" && !Array.isArray(item),
          )
        : [],
      appliedAt: typeof record.appliedAt === "string" ? record.appliedAt : null,
      createdAt: typeof record.createdAt === "string" ? record.createdAt : "",
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : "",
    },
  ];
}

function normalizeProposalStatus(value: string): ScheduleProposal["status"] {
  return value === "confirmed" ||
    value === "applied" ||
    value === "superseded" ||
    value === "canceled"
    ? value
    : "draft";
}

function normalizeProposalOperations(value: unknown): ScheduleProposal["operations"] {
  return Array.isArray(value)
    ? value.flatMap((item): ScheduleProposal["operations"] => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return [];
        }

        const record = item as Record<string, unknown>;

        if (
          record.type === "schedule_task" &&
          typeof record.taskId === "string" &&
          typeof record.title === "string" &&
          typeof record.description === "string" &&
          typeof record.startTime === "string" &&
          typeof record.endTime === "string"
        ) {
          return [
            {
              type: "schedule_task" as const,
              taskId: record.taskId,
              title: record.title,
              description: record.description,
              startTime: record.startTime,
              endTime: record.endTime,
            },
          ];
        }

        if (
          record.type === "schedule_goal_focus" &&
          typeof record.goalId === "string" &&
          (typeof record.focusId === "string" || record.focusId === null) &&
          typeof record.title === "string" &&
          typeof record.description === "string" &&
          typeof record.startTime === "string" &&
          typeof record.endTime === "string"
        ) {
          return [
            {
              type: "schedule_goal_focus" as const,
              goalId: record.goalId,
              focusId: record.focusId,
              title: record.title,
              description: record.description,
              startTime: record.startTime,
              endTime: record.endTime,
            },
          ];
        }

        return [];
      })
    : [];
}

function getProposalPreviewRange(proposal: ScheduleProposal) {
  const proposalEvents = getProposalPreviewEvents(proposal);

  if (proposalEvents.length === 0) {
    return null;
  }

  const eventDays = proposalEvents
    .flatMap((event) => [startOfDay(event.startTime), startOfDay(event.endTime)])
    .sort((left, right) => left.getTime() - right.getTime());
  const startDate = eventDays[0];
  const lastDate = eventDays[eventDays.length - 1];

  if (!startDate || !lastDate) {
    return null;
  }

  const dayCount = Math.min(
    7,
    Math.max(1, differenceInCalendarDays(lastDate, startDate) + 1),
  );

  return {
    startDate,
    endDate: addDays(startDate, dayCount - 1),
    dayCount,
  };
}

function getProposalPreviewEvents(
  proposal: ScheduleProposal,
): ProposalPreviewEvent[] {
  return proposal.operations.flatMap((operation, index) => {
    const startTime = new Date(operation.startTime);
    const endTime = new Date(operation.endTime);

    if (
      Number.isNaN(startTime.getTime()) ||
      Number.isNaN(endTime.getTime()) ||
      endTime <= startTime
    ) {
      return [];
    }

    return [
      {
        id: `${proposal.id}:proposal:${index}`,
        title: operation.title,
        startTime,
        endTime,
        allDay: false,
        source: "proposal" as const,
      },
    ];
  });
}

function normalizeProposalConflicts(
  value: unknown,
): ScheduleProposal["conflictAnnotations"] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          return [];
        }

        const record = item as Record<string, unknown>;

        if (
          typeof record.title !== "string" ||
          typeof record.detail !== "string" ||
          (record.strength !== "hard_constraint" &&
            record.strength !== "soft_preference")
        ) {
          return [];
        }

        return [
          {
            type:
              record.type === "work_hours" ||
              record.type === "no_schedule_window" ||
              record.type === "sleep_window" ||
              record.type === "latest_work_end" ||
              record.type === "recovery_day"
                ? record.type
                : "work_hours",
            title: record.title,
            detail: record.detail,
            strength: record.strength,
          },
        ];
      })
    : [];
}

function formatPreviewDay(value: Date) {
  return formatLocaleDate(value, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
}

function formatPreviewRange(startDate: Date, endDate: Date) {
  if (differenceInCalendarDays(endDate, startDate) === 0) {
    return formatPreviewDay(startDate);
  }

  return `${formatPreviewDay(startDate)} - ${formatPreviewDay(endDate)}`;
}

function formatPreviewHour(hour: number) {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const suffix = normalizedHour >= 12 ? "p" : "a";
  const displayHour = normalizedHour % 12 || 12;

  return `${displayHour}${suffix}`;
}

function formatPreviewEventTime(event: ProposalPreviewEvent) {
  return `${formatShortTime(event.startTime)}-${formatShortTime(event.endTime)}`;
}

function formatShortTime(value: Date) {
  const hours = value.getHours();
  const minutes = value.getMinutes();
  const suffix = hours >= 12 ? "p" : "a";
  const displayHour = hours % 12 || 12;

  return minutes === 0
    ? `${displayHour}${suffix}`
    : `${displayHour}:${minutes.toString().padStart(2, "0")}${suffix}`;
}

function getProposalStatusColor(status: ScheduleProposal["status"]) {
  if (status === "applied" || status === "confirmed") {
    return "#d7e7e1";
  }

  if (status === "canceled" || status === "superseded") {
    return "#f3d0c9";
  }

  return "#efe1bc";
}
