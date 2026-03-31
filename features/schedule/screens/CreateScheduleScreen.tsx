import * as Crypto from "expo-crypto";
import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/features/auth/AuthProvider";
import { connectGoogleCalendar } from "@/features/auth/googleAuth";
import { sendPlanningTurn } from "@/features/planning/api/planningApi";
import {
  createEmptyDraftPlanningState,
  type GeneratedPlan,
  type PlanningChatMessage,
  type PlanningTurnStatus,
} from "@/features/planning/types";

export default function CreateScheduleScreen() {
  const { authId, isAuthenticated, clearAuthId, setAuthId } = useAuth();
  const [messages, setMessages] = useState<PlanningChatMessage[]>([]);
  const [draftPlanningState, setDraftPlanningState] = useState(
    createEmptyDraftPlanningState(),
  );
  const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);
  const [composerValue, setComposerValue] = useState("");
  const [screenState, setScreenState] = useState<PlanningTurnStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isWaitingForResponse = screenState === "waiting_for_response";

  async function handleConnectGoogle() {
    setErrorMessage(null);

    try {
      const result = await connectGoogleCalendar();

      if (result.type === "success") {
        const nextAuthId = getAuthIdFromUrl(result.url);

        if (nextAuthId) {
          setAuthId(nextAuthId);
          return;
        }

        setErrorMessage(
          "Google authentication finished, but no authId was returned.",
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
          : "Unable to connect to Google right now.",
      );
    }
  }

  async function handleSendMessage() {
    const nextMessage = composerValue.trim();

    if (!nextMessage || isWaitingForResponse) {
      return;
    }

    const nextHistory = [
      ...messages,
      {
        id: Crypto.randomUUID(),
        role: "user" as const,
        content: nextMessage,
      },
    ];

    setMessages(nextHistory);
    setComposerValue("");
    setErrorMessage(null);
    setScreenState("waiting_for_response");

    try {
      const response = await sendPlanningTurn({
        chatHistory: nextHistory,
        currentDraftPlanningState: draftPlanningState,
      });

      setDraftPlanningState(response.draftPlanningState);
      setGeneratedPlan(response.generatedPlan);
      setMessages((previousMessages) => [
        ...previousMessages,
        {
          id: Crypto.randomUUID(),
          role: "assistant",
          content: response.assistantMessage,
        },
      ]);
      setScreenState(
        response.status === "plan_ready" ? "draft_ready" : "collecting_input",
      );
    } catch (error) {
      setScreenState("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to process planning turn.",
      );
    }
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: "#f4f1ea",
      }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 18,
        }}
      >
        <View
          style={{
            backgroundColor: "#16423c",
            borderRadius: 24,
            padding: 20,
            gap: 12,
          }}
        >
          <Text
            style={{
              fontSize: 28,
              fontWeight: "700",
              color: "#f4f1ea",
            }}
          >
            Build the first plan draft
          </Text>
          <Text
            style={{
              fontSize: 16,
              lineHeight: 22,
              color: "#d9e7e3",
            }}
          >
            Start with a messy goal or problem statement. Productive will ask
            one focused follow-up at a time, extract a structured planning
            draft behind the scenes, and stop once it has enough to draft a
            realistic first plan.
          </Text>
          <Link
            href="/calendar"
            style={{
              alignSelf: "flex-start",
              color: "#f6c453",
              fontWeight: "600",
            }}
          >
            Open the existing calendar view
          </Link>
          <View
            style={{
              flexDirection: "row",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <Pressable
              onPress={handleConnectGoogle}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderRadius: 16,
                backgroundColor: isAuthenticated ? "#d5ebe2" : "#f6c453",
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: "#16423c",
                }}
              >
                {isAuthenticated ? "Google connected" : "Connect Google Calendar"}
              </Text>
            </Pressable>
            {isAuthenticated ? (
              <Pressable
                onPress={clearAuthId}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 16,
                  backgroundColor: "#f1ece4",
                }}
              >
                <Text
                  style={{
                    fontWeight: "600",
                    color: "#5f6b76",
                  }}
                >
                  Reset connection
                </Text>
              </Pressable>
            ) : null}
            <Text
              style={{
                color: "#d9e7e3",
                lineHeight: 20,
                flexShrink: 1,
              }}
            >
              {authId
                ? "Calendar access is available from the homepage and calendar view."
                : "Calendar linking stays available here for later scheduling work."}
            </Text>
          </View>
        </View>

        <View
          style={{
            backgroundColor: "#fffdf8",
            borderRadius: 20,
            padding: 18,
            gap: 14,
            borderWidth: 1,
            borderColor: "#dfd6c8",
          }}
        >
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: "#1f2937",
            }}
          >
            Planning chat
          </Text>
          <Text
            style={{
              color: "#5f6b76",
              lineHeight: 20,
            }}
          >
            Focus on what you are trying to achieve, what is making it hard, and
            what constraints are real. The assistant will keep pulling the
            conversation toward a usable planning draft.
          </Text>

          <View
            style={{
              gap: 12,
            }}
          >
            {messages.length === 0 ? (
              <View
                style={{
                  borderRadius: 16,
                  padding: 14,
                  backgroundColor: "#f7f3ec",
                  borderWidth: 1,
                  borderColor: "#eadfce",
                }}
              >
                <Text
                  style={{
                    color: "#5f6b76",
                    lineHeight: 20,
                  }}
                >
                  Example: "I want to get much better at software engineering,
                  but my weeks get eaten by work, phone distraction, and random
                  errands."
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
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor:
                    message.role === "user" ? "#16423c" : "#f7f3ec",
                  borderWidth: message.role === "assistant" ? 1 : 0,
                  borderColor: "#dfd6c8",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    marginBottom: 6,
                    color:
                      message.role === "user" ? "#d9e7e3" : "#5f6b76",
                  }}
                >
                  {message.role === "user" ? "You" : "Productive"}
                </Text>
                <Text
                  style={{
                    color: message.role === "user" ? "#f4f1ea" : "#1f2937",
                    lineHeight: 20,
                  }}
                >
                  {message.content}
                </Text>
              </View>
            ))}

            {isWaitingForResponse ? (
              <View
                style={{
                  alignSelf: "flex-start",
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  backgroundColor: "#f7f3ec",
                  borderWidth: 1,
                  borderColor: "#dfd6c8",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <ActivityIndicator color="#16423c" />
                <Text
                  style={{
                    color: "#5f6b76",
                  }}
                >
                  Building the next planning turn...
                </Text>
              </View>
            ) : null}
          </View>

          {errorMessage ? (
            <Text
              style={{
                color: "#9b2c2c",
                backgroundColor: "#fce8e8",
                padding: 12,
                borderRadius: 14,
              }}
            >
              {errorMessage}
            </Text>
          ) : null}

          <View
            style={{
              gap: 10,
            }}
          >
            <TextInput
              value={composerValue}
              onChangeText={setComposerValue}
              placeholder="Describe the goal, friction, or current situation..."
              placeholderTextColor="#8a96a3"
              editable={!isWaitingForResponse}
              multiline
              style={{
                minHeight: 112,
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "#dfd6c8",
                backgroundColor: "#ffffff",
                paddingHorizontal: 14,
                paddingVertical: 14,
                textAlignVertical: "top",
                color: "#1f2937",
              }}
            />

            <Pressable
              onPress={handleSendMessage}
              disabled={isWaitingForResponse || composerValue.trim().length === 0}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 16,
                borderRadius: 18,
                backgroundColor:
                  isWaitingForResponse || composerValue.trim().length === 0
                    ? "#d6ddd9"
                    : "#16423c",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: "#f4f1ea",
                }}
              >
                Send
              </Text>
            </Pressable>
          </View>
        </View>

        {generatedPlan ? (
          <View
            style={{
              backgroundColor: "#fffdf8",
              borderRadius: 20,
              padding: 18,
              gap: 14,
              borderWidth: 1,
              borderColor: "#dfd6c8",
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: "#1f2937",
              }}
            >
              Draft plan review
            </Text>
            <PlanSection label="Direction" value={generatedPlan.direction} />
            <PlanSection
              label="Medium-term goal"
              value={generatedPlan.mediumTermGoal}
            />
            <PlanListSection
              label="30-day performance goals"
              items={generatedPlan.thirtyDayPerformanceGoals}
            />
            <PlanListSection
              label="14-day performance goals"
              items={generatedPlan.fourteenDayPerformanceGoals}
            />
            <PlanSection
              label="Time availability"
              value={generatedPlan.timeAvailability}
            />
            <PlanListSection
              label="Time protection plan"
              items={generatedPlan.timeProtectionPlan}
            />
            <PlanListSection
              label="Limiting habits"
              items={generatedPlan.limitingHabits}
            />
            <PlanListSection
              label="Scripted actions"
              items={generatedPlan.scriptedActions}
            />
            <PlanListSection
              label="Environmental optimizations"
              items={generatedPlan.environmentalOptimizations}
            />
            <PlanListSection
              label="Constraints"
              items={generatedPlan.constraints}
            />
            <PlanSection label="Summary" value={generatedPlan.summary} />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

type PlanSectionProps = {
  label: string;
  value: string;
};

function PlanSection({ label, value }: PlanSectionProps) {
  return (
    <View
      style={{
        gap: 6,
      }}
    >
      <Text
        style={{
          fontWeight: "700",
          fontSize: 16,
          color: "#16423c",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: "#1f2937",
          lineHeight: 21,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

type PlanListSectionProps = {
  label: string;
  items: string[];
};

function PlanListSection({ label, items }: PlanListSectionProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View
      style={{
        gap: 8,
      }}
    >
      <Text
        style={{
          fontWeight: "700",
          fontSize: 16,
          color: "#16423c",
        }}
      >
        {label}
      </Text>
      <View style={{ gap: 8 }}>
        {items.map((item) => (
          <View
            key={`${label}-${item}`}
            style={{
              padding: 12,
              borderRadius: 14,
              backgroundColor: "#f7f3ec",
              borderWidth: 1,
              borderColor: "#eadfce",
            }}
          >
            <Text
              style={{
                color: "#1f2937",
                lineHeight: 20,
              }}
            >
              {item}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function getAuthIdFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.searchParams.get("authId");
  } catch {
    return null;
  }
}
