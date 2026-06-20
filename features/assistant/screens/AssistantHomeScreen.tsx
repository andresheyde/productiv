import {
  addDays,
  differenceInCalendarDays,
  differenceInMinutes,
  startOfDay,
} from "date-fns";
import { useEffect, useMemo, useState } from "react";
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
import { fetchScheduleEvents } from "@/features/schedule/api/scheduleApi";
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
  const [proposalFeedbackDrafts, setProposalFeedbackDrafts] = useState<
    Record<string, string>
  >({});
  const [actedProposalIds, setActedProposalIds] = useState<Set<string>>(
    () => new Set(),
  );

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

  async function handleProposalDecision(
    proposal: ScheduleProposal,
    decision: "accept" | "reject",
  ) {
    if (isSendingMessage || actedProposalIds.has(proposal.id)) {
      return;
    }

    const feedback = proposalFeedbackDrafts[proposal.id]?.trim();
    const decisionText =
      decision === "accept"
        ? `Confirm schedule proposal ${proposal.id}.`
        : `Dismiss schedule proposal ${proposal.id}.`;
    const message = feedback
      ? `${decisionText} Feedback: ${feedback}`
      : decisionText;

    setActedProposalIds((currentIds) => new Set(currentIds).add(proposal.id));

    const didSend = await sendAssistantTurn({
      message,
      mode: "chat",
    });

    if (didSend) {
      setProposalFeedbackDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[proposal.id];
        return nextDrafts;
      });
      return;
    }

    setActedProposalIds((currentIds) => {
      const nextIds = new Set(currentIds);
      nextIds.delete(proposal.id);
      return nextIds;
    });
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
            keyboardShouldPersistTaps="handled"
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
                actedProposalIds={actedProposalIds}
                feedbackDrafts={proposalFeedbackDrafts}
                isSendingMessage={isSendingMessage}
                message={message}
                onChangeFeedback={(proposalId, value) => {
                  setProposalFeedbackDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    [proposalId]: value,
                  }));
                }}
                onProposalDecision={(proposal, decision) => {
                  void handleProposalDecision(proposal, decision);
                }}
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
                  : composerMode === "schedule_reflection"
                    ? "Schedule reflection is on"
                  : "Chat mode is on"}
              </Text>
              {composerMode !== "chat" ? (
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
                  : composerMode === "schedule_reflection"
                    ? "What worked, what didn't, and what got in the way?"
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

function AssistantChatMessage({
  actedProposalIds,
  feedbackDrafts,
  isSendingMessage,
  message,
  onChangeFeedback,
  onProposalDecision,
}: {
  actedProposalIds: Set<string>;
  feedbackDrafts: Record<string, string>;
  isSendingMessage: boolean;
  message: AssistantMessage;
  onChangeFeedback: (proposalId: string, value: string) => void;
  onProposalDecision: (
    proposal: ScheduleProposal,
    decision: "accept" | "reject",
  ) => void;
}) {
  const scheduleProposals = getMessageScheduleProposals(message);

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
        <ScheduleProposalCard
          key={proposal.id}
          feedbackValue={feedbackDrafts[proposal.id] ?? ""}
          hasActed={actedProposalIds.has(proposal.id)}
          isSendingMessage={isSendingMessage}
          onChangeFeedback={(value) => onChangeFeedback(proposal.id, value)}
          onDecision={(decision) => onProposalDecision(proposal, decision)}
          proposal={proposal}
        />
      ))}
    </View>
  );
}

function ScheduleProposalCard({
  feedbackValue,
  hasActed,
  isSendingMessage,
  onChangeFeedback,
  onDecision,
  proposal,
}: {
  feedbackValue: string;
  hasActed: boolean;
  isSendingMessage: boolean;
  onChangeFeedback: (value: string) => void;
  onDecision: (decision: "accept" | "reject") => void;
  proposal: ScheduleProposal;
}) {
  const canAct = proposal.status === "draft" && !hasActed && !isSendingMessage;

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
          paddingHorizontal: 14,
          paddingTop: 14,
          paddingBottom: 10,
          gap: 8,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                color: "#132521",
                fontSize: 16,
                fontWeight: "800",
              }}
            >
              {proposal.title}
            </Text>
            <Text
              style={{
                color: "#5a6762",
                lineHeight: 20,
              }}
            >
              {proposal.summary}
            </Text>
          </View>
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
      </View>

      <ScheduleProposalWeekPreview proposal={proposal} />

      <ScrollView
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        style={{
          maxHeight: 300,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: "#ddd3c3",
        }}
        contentContainerStyle={{
          padding: 14,
          gap: 12,
        }}
      >
        {proposal.operations.map((operation, index) => (
          <View
            key={getProposalOperationKey(proposal.id, operation, index)}
            style={{
              borderRadius: 14,
              backgroundColor: "#fffaf2",
              padding: 12,
              gap: 8,
            }}
          >
            <Text
              style={{
                color: "#132521",
                fontWeight: "800",
              }}
            >
              {operation.title}
            </Text>
            <ProposalDetailRow
              label="Type"
              value={operation.type === "schedule_task" ? "Task" : "Goal focus"}
            />
            {operation.description ? (
              <Text
                style={{
                  color: "#5a6762",
                  lineHeight: 20,
                }}
              >
                {operation.description}
              </Text>
            ) : null}
            <ProposalDetailRow label="Starts" value={formatProposalDateTime(operation.startTime)} />
            <ProposalDetailRow label="Ends" value={formatProposalDateTime(operation.endTime)} />
          </View>
        ))}

        {proposal.conflictAnnotations.length > 0 ? (
          <View
            style={{
              borderRadius: 14,
              backgroundColor: "#fbe9e6",
              padding: 12,
              gap: 8,
            }}
          >
            <Text
              style={{
                color: "#7f2d24",
                fontWeight: "800",
              }}
            >
              Conflicts to review
            </Text>
            {proposal.conflictAnnotations.map((conflict, index) => (
              <View key={`${proposal.id}-conflict-${index}`} style={{ gap: 2 }}>
                <Text
                  style={{
                    color: "#7f2d24",
                    fontWeight: "700",
                  }}
                >
                  {conflict.title}
                </Text>
                <Text
                  style={{
                    color: "#7f2d24",
                    lineHeight: 19,
                  }}
                >
                  {conflict.detail}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <View
            style={{
              borderRadius: 14,
              backgroundColor: "#d7e7e1",
              padding: 12,
            }}
          >
            <Text
              style={{
                color: "#123a35",
                fontWeight: "700",
              }}
            >
              No saved scheduling conflicts found.
            </Text>
          </View>
        )}
      </ScrollView>

      <View
        style={{
          padding: 14,
          gap: 10,
        }}
      >
        <TextInput
          value={feedbackValue}
          onChangeText={onChangeFeedback}
          editable={canAct}
          multiline
          placeholder="Add feedback before accepting or rejecting..."
          placeholderTextColor="#88938f"
          style={{
            minHeight: 72,
            borderRadius: 14,
            backgroundColor: "#fffaf2",
            borderWidth: 1,
            borderColor: "#ddd3c3",
            color: "#162a26",
            paddingHorizontal: 12,
            paddingVertical: 10,
            textAlignVertical: "top",
          }}
        />
        <View
          style={{
            flexDirection: "row",
            gap: 10,
          }}
        >
          <ProposalDecisionButton
            disabled={!canAct}
            label={hasActed ? "Sent" : "Accept"}
            onPress={() => onDecision("accept")}
            variant="accept"
          />
          <ProposalDecisionButton
            disabled={!canAct}
            label="Reject"
            onPress={() => onDecision("reject")}
            variant="reject"
          />
        </View>
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

const PREVIEW_START_HOUR = 6;
const PREVIEW_END_HOUR = 22;
const PREVIEW_HOUR_HEIGHT = 30;
const PREVIEW_DAY_WIDTH = 96;
const PREVIEW_TIMED_HEIGHT =
  (PREVIEW_END_HOUR - PREVIEW_START_HOUR) * PREVIEW_HOUR_HEIGHT;

function ScheduleProposalWeekPreview({
  proposal,
}: {
  proposal: ScheduleProposal;
}) {
  const { isAuthenticated, sessionToken } = useAuth();
  const range = useMemo(() => getProposalPreviewRange(proposal), [proposal]);
  const rangeKey = range
    ? `${range.startDate.toISOString()}:${range.endDate.toISOString()}`
    : "";
  const [calendarEvents, setCalendarEvents] = useState<ProposalPreviewEvent[]>(
    [],
  );
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

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

  if (!range) {
    return null;
  }

  const days = Array.from({ length: range.dayCount }, (_, index) =>
    addDays(range.startDate, index),
  );
  const previewEvents = [...calendarEvents, ...proposalEvents];
  const allDayEvents = previewEvents.filter((event) => event.allDay);
  const timedEvents = previewEvents.filter((event) => !event.allDay);

  return (
    <View
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
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text
          style={{
            color: "#132521",
            fontWeight: "800",
          }}
        >
          Calendar preview
        </Text>
        <Text
          style={{
            color: "#68736f",
            fontSize: 12,
            fontWeight: "700",
          }}
        >
          {isLoadingPreview ? "Loading" : `${proposalEvents.length} proposed`}
        </Text>
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
            paddingHorizontal: 14,
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
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 14,
        }}
      >
        <View>
          <View style={{ flexDirection: "row" }}>
            {days.map((day) => (
              <View
                key={day.toISOString()}
                style={{
                  width: PREVIEW_DAY_WIDTH,
                  paddingBottom: 8,
                  paddingRight: 8,
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
              height: PREVIEW_TIMED_HEIGHT,
            }}
          >
            {days.map((day) => (
              <View
                key={`${day.toISOString()}-body`}
                style={{
                  width: PREVIEW_DAY_WIDTH,
                  height: PREVIEW_TIMED_HEIGHT,
                  borderLeftWidth: 1,
                  borderColor: "#e8ded0",
                  paddingRight: 8,
                }}
              >
                {timedEvents
                  .filter(
                    (event) =>
                      differenceInCalendarDays(
                        startOfDay(event.startTime),
                        day,
                      ) === 0,
                  )
                  .map((event) => (
                    <PreviewEventBlock
                      key={event.id}
                      event={event}
                    />
                  ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function PreviewEventBlock({ event }: { event: ProposalPreviewEvent }) {
  const dayStart = startOfDay(event.startTime);
  const previewStart = new Date(dayStart);
  previewStart.setHours(PREVIEW_START_HOUR, 0, 0, 0);
  const previewEnd = new Date(dayStart);
  previewEnd.setHours(PREVIEW_END_HOUR, 0, 0, 0);
  const visibleStart = new Date(
    Math.max(event.startTime.getTime(), previewStart.getTime()),
  );
  const visibleEnd = new Date(
    Math.min(event.endTime.getTime(), previewEnd.getTime()),
  );

  if (visibleEnd <= visibleStart) {
    return null;
  }

  const top = Math.max(0, differenceInMinutes(visibleStart, previewStart)) *
    (PREVIEW_HOUR_HEIGHT / 60);
  const height = Math.max(
    18,
    differenceInMinutes(visibleEnd, visibleStart) *
      (PREVIEW_HOUR_HEIGHT / 60),
  );
  const isProposal = event.source === "proposal";

  return (
    <View
      style={{
        position: "absolute",
        left: 4,
        right: 10,
        top,
        height,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: isProposal ? "#d29d12" : "#aebbb5",
        backgroundColor: isProposal ? "#fde7a1" : "#e8efec",
        paddingHorizontal: 6,
        paddingVertical: 4,
        overflow: "hidden",
      }}
    >
      <Text
        numberOfLines={2}
        style={{
          color: "#132521",
          fontSize: 11,
          fontWeight: "800",
        }}
      >
        {event.title}
      </Text>
    </View>
  );
}

function ProposalDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Text
        style={{
          color: "#65716d",
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: "#162a26",
          flex: 1,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function ProposalDecisionButton({
  disabled,
  label,
  onPress,
  variant,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  variant: "accept" | "reject";
}) {
  const activeColor = variant === "accept" ? "#123a35" : "#7f2d24";

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: 1,
        borderRadius: 14,
        alignItems: "center",
        paddingHorizontal: 12,
        paddingVertical: 13,
        backgroundColor: disabled ? "#cdd6d2" : activeColor,
      }}
    >
      <Text
        style={{
          color: "#f4f0e8",
          fontWeight: "800",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function getMessageScheduleProposals(message: AssistantMessage) {
  if (message.role !== "assistant") {
    return [];
  }

  const payload = message.structuredPayload;
  const directProposals = getScheduleProposalArray(payload.scheduleProposals);
  const sideEffectProposals =
    payload.sideEffects &&
    typeof payload.sideEffects === "object" &&
    !Array.isArray(payload.sideEffects)
      ? getScheduleProposalArray(
          (payload.sideEffects as Record<string, unknown>).scheduleProposals,
        )
      : [];
  const proposalsById = new Map<string, ScheduleProposal>();

  [...directProposals, ...sideEffectProposals].forEach((proposal) => {
    proposalsById.set(proposal.id, proposal);
  });

  return Array.from(proposalsById.values());
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

function getProposalOperationKey(
  proposalId: string,
  operation: ScheduleProposal["operations"][number],
  index: number,
) {
  const recordId =
    operation.type === "schedule_task"
      ? operation.taskId
      : `${operation.goalId}-${operation.focusId ?? "goal"}`;

  return `${proposalId}-${recordId}-${operation.startTime}-${index}`;
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

function formatProposalDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPreviewDay(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  }).format(value);
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
