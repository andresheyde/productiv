import type { ReactNode } from "react";
import { useMemo, useState } from "react";
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
import WorkspaceAuthGate from "@/features/workspace/components/WorkspaceAuthGate";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import type { Goal } from "@/features/workspace/types";

export default function GoalsScreen() {
  const { isAuthReady, isAuthenticated } = useAuth();
  const { goals, isLoading, metrics, tasks, updateGoal, workLogs } = useWorkspace();
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [draftDefinition, setDraftDefinition] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftPriority, setDraftPriority] = useState("");
  const [draftStatus, setDraftStatus] = useState<Goal["status"]>("active");
  const [savingGoalId, setSavingGoalId] = useState<string | null>(null);

  const activeGoals = useMemo(
    () => goals.filter((goal) => goal.status !== "archived"),
    [goals],
  );

  if (!isAuthReady) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f3efe6",
        }}
      >
        <ActivityIndicator size="large" color="#123a35" />
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <WorkspaceAuthGate
        title="Goals live here once you connect"
        description="Create and refine goals through chat, then review their linked progress bars, tasks, and recent work logs in one place."
      />
    );
  }

  async function handleSave(goalId: string) {
    setSavingGoalId(goalId);

    try {
      await updateGoal({
        goalId,
        definition: draftDefinition,
        notes: draftNotes.length > 0 ? draftNotes : null,
        priorityRank: Number.parseInt(draftPriority, 10) || 100,
        status: draftStatus,
      });
      setEditingGoalId(null);
    } finally {
      setSavingGoalId(null);
    }
  }

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={{
        flex: 1,
        backgroundColor: "#f3efe6",
      }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 18,
          gap: 16,
        }}
      >
        <View
          style={{
            borderRadius: 26,
            backgroundColor: "#123a35",
            padding: 20,
            gap: 8,
          }}
        >
          <Text
            style={{
              fontSize: 26,
              fontWeight: "700",
              color: "#f4f0e8",
            }}
          >
            Goals
          </Text>
          <Text
            style={{
              color: "#bfd1ca",
              lineHeight: 20,
            }}
          >
            Productiv uses chat to shape goals, then keeps the current definition,
            linked progress bars, and supporting work visible here.
          </Text>
        </View>

        {isLoading && goals.length === 0 ? (
          <ActivityIndicator size="large" color="#123a35" />
        ) : null}

        {activeGoals.length === 0 && !isLoading ? (
          <View
            style={{
              borderRadius: 24,
              backgroundColor: "#fffaf2",
              borderWidth: 1,
              borderColor: "#ddd3c3",
              padding: 20,
            }}
          >
            <Text
              style={{
                color: "#132521",
                fontWeight: "700",
                fontSize: 18,
                marginBottom: 8,
              }}
            >
              No goals yet
            </Text>
            <Text
              style={{
                color: "#5a6762",
                lineHeight: 22,
              }}
            >
              Start in the chat screen with a messy idea or a clear outcome. The
              assistant will turn it into a real goal here.
            </Text>
          </View>
        ) : null}

        {activeGoals.map((goal) => {
          const linkedMetrics = metrics.filter((metric) => metric.goalId === goal.id);
          const linkedTasks = tasks.filter((task) => task.goalId === goal.id);
          const linkedLogs = workLogs
            .filter((workLog) => workLog.goalId === goal.id)
            .slice(0, 2);
          const isEditing = editingGoalId === goal.id;

          return (
            <View
              key={goal.id}
              style={{
                borderRadius: 24,
                backgroundColor: "#fffaf2",
                borderWidth: 1,
                borderColor: "#ddd3c3",
                padding: 18,
                gap: 14,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <View style={{ flex: 1, gap: 8 }}>
                  <Text
                    style={{
                      color: "#132521",
                      fontSize: 20,
                      fontWeight: "700",
                    }}
                  >
                    {goal.title}
                  </Text>
                  <View
                    style={{
                      alignSelf: "flex-start",
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor:
                        goal.status === "active" ? "#d7e7e1" : "#efe1bc",
                    }}
                  >
                    <Text
                      style={{
                        color: "#123a35",
                        fontWeight: "700",
                        textTransform: "capitalize",
                      }}
                    >
                      {goal.status}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => {
                    if (isEditing) {
                      setEditingGoalId(null);
                      return;
                    }

                    setEditingGoalId(goal.id);
                    setDraftDefinition(goal.definition);
                    setDraftNotes(goal.notes ?? "");
                    setDraftPriority(String(goal.priorityRank));
                    setDraftStatus(goal.status);
                  }}
                  style={{
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    backgroundColor: "#efe9dd",
                  }}
                >
                  <Text
                    style={{
                      color: "#31413c",
                      fontWeight: "700",
                    }}
                  >
                    {isEditing ? "Close" : "Quick edit"}
                  </Text>
                </Pressable>
              </View>

              <Text
                style={{
                  color: "#5a6762",
                  lineHeight: 22,
                }}
              >
                {goal.definition || "This goal still needs a richer definition from chat."}
              </Text>

              {linkedMetrics.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {linkedMetrics.map((metric) => {
                    const progress = Math.min(
                      metric.currentValue / metric.targetValue,
                      1,
                    );

                    return (
                      <View
                        key={metric.id}
                        style={{
                          gap: 8,
                          padding: 14,
                          borderRadius: 18,
                          backgroundColor: "#f4eee2",
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <Text
                            style={{
                              color: "#132521",
                              fontWeight: "700",
                              flex: 1,
                            }}
                          >
                            {metric.name}
                          </Text>
                          <Text
                            style={{
                              color: "#31413c",
                              fontWeight: "700",
                            }}
                          >
                            {metric.currentValue} / {metric.targetValue} {metric.unitLabel}
                          </Text>
                        </View>
                        <View
                          style={{
                            height: 10,
                            borderRadius: 999,
                            backgroundColor: "#d9d0bf",
                            overflow: "hidden",
                          }}
                        >
                          <View
                            style={{
                              width: `${progress * 100}%`,
                              height: "100%",
                              backgroundColor: "#123a35",
                            }}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <InfoChip
                  label={`${linkedTasks.length} linked task${linkedTasks.length === 1 ? "" : "s"}`}
                />
                <InfoChip
                  label={`${linkedLogs.length} recent log${linkedLogs.length === 1 ? "" : "s"}`}
                />
                <InfoChip label={`Priority ${goal.priorityRank}`} />
              </View>

              {linkedLogs.length > 0 ? (
                <View style={{ gap: 8 }}>
                  {linkedLogs.map((log) => (
                    <View
                      key={log.id}
                      style={{
                        padding: 12,
                        borderRadius: 16,
                        backgroundColor: "#f4eee2",
                      }}
                    >
                      <Text
                        style={{
                          color: "#31413c",
                          lineHeight: 20,
                        }}
                      >
                        {log.summary}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {isEditing ? (
                <View
                  style={{
                    paddingTop: 6,
                    gap: 12,
                    borderTopWidth: 1,
                    borderTopColor: "#e6dccd",
                  }}
                >
                  <LabeledField label="Definition">
                    <TextInput
                      value={draftDefinition}
                      onChangeText={setDraftDefinition}
                      multiline
                      style={multilineInputStyle}
                    />
                  </LabeledField>

                  <LabeledField label="Notes">
                    <TextInput
                      value={draftNotes}
                      onChangeText={setDraftNotes}
                      multiline
                      style={multilineInputStyle}
                    />
                  </LabeledField>

                  <LabeledField label="Priority">
                    <TextInput
                      value={draftPriority}
                      onChangeText={setDraftPriority}
                      keyboardType="number-pad"
                      style={singleLineInputStyle}
                    />
                  </LabeledField>

                  <View style={{ gap: 8 }}>
                    <Text
                      style={{
                        color: "#31413c",
                        fontWeight: "700",
                      }}
                    >
                      Status
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      {(["active", "paused", "completed"] as Goal["status"][]).map(
                        (status) => (
                          <StatusButton
                            key={status}
                            isActive={draftStatus === status}
                            label={status}
                            onPress={() => setDraftStatus(status)}
                          />
                        ),
                      )}
                    </View>
                  </View>

                  <Pressable
                    onPress={() => {
                      void handleSave(goal.id);
                    }}
                    disabled={savingGoalId === goal.id}
                    style={{
                      borderRadius: 16,
                      paddingVertical: 14,
                      alignItems: "center",
                      backgroundColor:
                        savingGoalId === goal.id ? "#cdd6d2" : "#123a35",
                    }}
                  >
                    <Text
                      style={{
                        color: "#f4f0e8",
                        fontWeight: "700",
                      }}
                    >
                      {savingGoalId === goal.id ? "Saving..." : "Save changes"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoChip({ label }: { label: string }) {
  return (
    <View
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
        {label}
      </Text>
    </View>
  );
}

function LabeledField({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          color: "#31413c",
          fontWeight: "700",
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function StatusButton({
  isActive,
  label,
  onPress,
}: {
  isActive: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: 14,
        backgroundColor: isActive ? "#123a35" : "#efe9dd",
      }}
    >
      <Text
        style={{
          color: isActive ? "#f4f0e8" : "#31413c",
          fontWeight: "700",
          textTransform: "capitalize",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const singleLineInputStyle = {
  borderRadius: 16,
  backgroundColor: "#f4eee2",
  paddingHorizontal: 12,
  paddingVertical: 12,
  color: "#132521",
} as const;

const multilineInputStyle = {
  ...singleLineInputStyle,
  minHeight: 90,
  textAlignVertical: "top",
} as const;
