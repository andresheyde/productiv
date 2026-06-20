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
import type { Task } from "@/features/workspace/types";

export default function TasksScreen() {
  const { isAuthReady, isAuthenticated } = useAuth();
  const { goals, isLoading, tasks, updateTask } = useWorkspace();
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<Task["status"]>("inbox");
  const [draftScheduleIntent, setDraftScheduleIntent] =
    useState<Task["scheduleIntent"]>("unscheduled");
  const [draftDueAt, setDraftDueAt] = useState("");
  const [draftEstimatedMinutes, setDraftEstimatedMinutes] = useState("");
  const [savingTaskId, setSavingTaskId] = useState<string | null>(null);

  const goalsById = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal.title])),
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
        title="Tasks are explicit to-dos"
        description="Tell Productiv when you want to save a concrete task, reminder, or one-session deliverable, then manage its due date and scheduling state here."
      />
    );
  }

  async function handleSave(taskId: string) {
    setSavingTaskId(taskId);

    try {
      await updateTask({
        taskId,
        dueAt: draftDueAt.trim().length > 0 ? draftDueAt.trim() : null,
        estimatedMinutes:
          draftEstimatedMinutes.trim().length > 0
            ? Number.parseInt(draftEstimatedMinutes, 10) || null
            : null,
        scheduleIntent: draftScheduleIntent,
        status: draftStatus,
      });
      setEditingTaskId(null);
    } finally {
      setSavingTaskId(null);
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
            Tasks
          </Text>
          <Text
            style={{
              color: "#bfd1ca",
              lineHeight: 20,
            }}
          >
            Specific to-dos, reminders, and one-session deliverables live here
            when you ask Productiv to save them.
          </Text>
        </View>

        {isLoading && tasks.length === 0 ? (
          <ActivityIndicator size="large" color="#123a35" />
        ) : null}

        {tasks.length === 0 && !isLoading ? (
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
              No tasks yet
            </Text>
            <Text
              style={{
                color: "#5a6762",
                lineHeight: 22,
              }}
            >
              Ask Productiv to add a specific task, reminder, or one-session
              deliverable when you want it tracked as a to-do.
            </Text>
          </View>
        ) : null}

        {tasks.map((task) => {
          const isEditing = editingTaskId === task.id;

          return (
            <View
              key={task.id}
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
                  gap: 12,
                }}
              >
                <View style={{ flex: 1, gap: 8 }}>
                  <Text
                    style={{
                      color: "#132521",
                      fontSize: 19,
                      fontWeight: "700",
                    }}
                  >
                    {task.title}
                  </Text>
                  <Text
                    style={{
                      color: "#5a6762",
                    }}
                  >
                    {task.goalId ? goalsById.get(task.goalId) ?? "Linked goal" : "No linked goal"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    if (isEditing) {
                      setEditingTaskId(null);
                      return;
                    }

                    setEditingTaskId(task.id);
                    setDraftStatus(task.status);
                    setDraftScheduleIntent(task.scheduleIntent);
                    setDraftDueAt(task.dueAt ?? "");
                    setDraftEstimatedMinutes(
                      task.estimatedMinutes ? String(task.estimatedMinutes) : "",
                    );
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

              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 10,
                }}
              >
                <TaskChip label={`Status: ${task.status}`} />
                <TaskChip
                  label={
                    task.linkedCalendarEventId ? "Scheduled" : "Not scheduled"
                  }
                />
                <TaskChip label={`Intent: ${task.scheduleIntent}`} />
              </View>

              <View style={{ gap: 6 }}>
                <Text
                  style={{
                    color: "#5a6762",
                  }}
                >
                  Due: {task.dueAt ? formatDate(task.dueAt) : "No due date"}
                </Text>
                <Text
                  style={{
                    color: "#5a6762",
                  }}
                >
                  Estimate:{" "}
                  {task.estimatedMinutes
                    ? `${task.estimatedMinutes} minutes`
                    : "Not set"}
                </Text>
              </View>

              {task.description ? (
                <Text
                  style={{
                    color: "#31413c",
                    lineHeight: 21,
                  }}
                >
                  {task.description}
                </Text>
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
                  <LabeledField label="Due date or time (ISO or YYYY-MM-DD)">
                    <TextInput
                      value={draftDueAt}
                      onChangeText={setDraftDueAt}
                      placeholder="2026-06-30T17:00:00.000Z"
                      placeholderTextColor="#8c9793"
                      style={singleLineInputStyle}
                    />
                  </LabeledField>

                  <LabeledField label="Estimated minutes">
                    <TextInput
                      value={draftEstimatedMinutes}
                      onChangeText={setDraftEstimatedMinutes}
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
                      {(
                        ["inbox", "planned", "scheduled", "done"] as Task["status"][]
                      ).map((status) => (
                        <StatusButton
                          key={status}
                          isActive={draftStatus === status}
                          label={status}
                          onPress={() => setDraftStatus(status)}
                        />
                      ))}
                    </View>
                  </View>

                  <View style={{ gap: 8 }}>
                    <Text
                      style={{
                        color: "#31413c",
                        fontWeight: "700",
                      }}
                    >
                      Schedule intent
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 8,
                      }}
                    >
                      {(
                        ["unscheduled", "schedule_now", "someday"] as Task["scheduleIntent"][]
                      ).map((intent) => (
                        <StatusButton
                          key={intent}
                          isActive={draftScheduleIntent === intent}
                          label={intent}
                          onPress={() => setDraftScheduleIntent(intent)}
                        />
                      ))}
                    </View>
                  </View>

                  <Pressable
                    onPress={() => {
                      void handleSave(task.id);
                    }}
                    disabled={savingTaskId === task.id}
                    style={{
                      borderRadius: 16,
                      paddingVertical: 14,
                      alignItems: "center",
                      backgroundColor:
                        savingTaskId === task.id ? "#cdd6d2" : "#123a35",
                    }}
                  >
                    <Text
                      style={{
                        color: "#f4f0e8",
                        fontWeight: "700",
                      }}
                    >
                      {savingTaskId === task.id ? "Saving..." : "Save changes"}
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

function formatDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function TaskChip({ label }: { label: string }) {
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
        {label.replaceAll("_", " ")}
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
