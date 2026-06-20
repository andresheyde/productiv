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
import type { Goal, GoalMetric } from "@/features/workspace/types";

export default function MetricsScreen() {
  const { isAuthReady, isAuthenticated } = useAuth();
  const { addMetricEntry, goals, isLoading, metrics } = useWorkspace();
  const [entryDrafts, setEntryDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingMetricId, setSavingMetricId] = useState<string | null>(null);
  const metricSections = useMemo(
    () => buildMetricSections(goals, metrics),
    [goals, metrics],
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
        title="Progress bars show up here"
        description="Keep metrics simple. Define them in chat, then log work or add progress manually from this screen."
      />
    );
  }

  async function handleAddEntry(metricId: string) {
    const rawValue = entryDrafts[metricId]?.trim() ?? "";
    const deltaValue = Number.parseFloat(rawValue);

    if (!Number.isFinite(deltaValue) || deltaValue === 0) {
      return;
    }

    setSavingMetricId(metricId);

    try {
      await addMetricEntry({
        metricId,
        deltaValue,
        note: noteDrafts[metricId]?.trim() || null,
      });
      setEntryDrafts((currentDrafts) => ({
        ...currentDrafts,
        [metricId]: "",
      }));
      setNoteDrafts((currentDrafts) => ({
        ...currentDrafts,
        [metricId]: "",
      }));
    } finally {
      setSavingMetricId(null);
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
            Metrics
          </Text>
          <Text
            style={{
              color: "#bfd1ca",
              lineHeight: 20,
            }}
          >
            Each metric is just a simple progress bar tied to a goal. Log work in
            chat or add progress here manually when you need to.
          </Text>
        </View>

        {isLoading && metrics.length === 0 ? (
          <ActivityIndicator size="large" color="#123a35" />
        ) : null}

        {metrics.length === 0 && !isLoading ? (
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
              No metrics yet
            </Text>
            <Text
              style={{
                color: "#5a6762",
                lineHeight: 22,
              }}
            >
              Ask Productiv to track something measurable like hours studied or
              interview questions completed.
            </Text>
          </View>
        ) : null}

        {metricSections.map((section) => (
          <View key={section.id} style={{ gap: 10 }}>
            <View style={{ gap: 4, paddingHorizontal: 2 }}>
              <Text
                style={{
                  color: "#132521",
                  fontSize: 20,
                  fontWeight: "800",
                }}
              >
                {section.title}
              </Text>
              <Text
                style={{
                  color: "#5a6762",
                  fontWeight: "700",
                }}
              >
                {section.subtitle}
              </Text>
            </View>

            {section.metrics.map((metric) => (
              <MetricCard
                key={metric.id}
                metric={metric}
                entryValue={entryDrafts[metric.id] ?? ""}
                noteValue={noteDrafts[metric.id] ?? ""}
                isSaving={savingMetricId === metric.id}
                onEntryChange={(value) =>
                  setEntryDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    [metric.id]: value,
                  }))
                }
                onNoteChange={(value) =>
                  setNoteDrafts((currentDrafts) => ({
                    ...currentDrafts,
                    [metric.id]: value,
                  }))
                }
                onAddEntry={() => {
                  void handleAddEntry(metric.id);
                }}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

type MetricSection = {
  id: string;
  metrics: GoalMetric[];
  subtitle: string;
  title: string;
};

function buildMetricSections(goals: Goal[], metrics: GoalMetric[]): MetricSection[] {
  const goalsById = new Map(goals.map((goal) => [goal.id, goal]));
  const metricsByGoalId = new Map<string, GoalMetric[]>();

  for (const metric of metrics) {
    const goalMetrics = metricsByGoalId.get(metric.goalId) ?? [];
    goalMetrics.push(metric);
    metricsByGoalId.set(metric.goalId, goalMetrics);
  }

  const goalSections = goals
    .filter((goal) => goal.status !== "archived")
    .map((goal) => ({
      id: goal.id,
      title: goal.title,
      subtitle: `${goal.status} goal - ${metricsByGoalId.get(goal.id)?.length ?? 0} metric${
        (metricsByGoalId.get(goal.id)?.length ?? 0) === 1 ? "" : "s"
      }`,
      metrics: sortMetrics(metricsByGoalId.get(goal.id) ?? []),
    }))
    .filter((section) => section.metrics.length > 0);

  const orphanMetrics = metrics.filter((metric) => !goalsById.has(metric.goalId));

  if (orphanMetrics.length === 0) {
    return goalSections;
  }

  return [
    ...goalSections,
    {
      id: "other-metrics",
      title: "Other metrics",
      subtitle: `${orphanMetrics.length} metric${orphanMetrics.length === 1 ? "" : "s"}`,
      metrics: sortMetrics(orphanMetrics),
    },
  ];
}

function sortMetrics(metrics: GoalMetric[]) {
  return [...metrics].sort((left, right) => {
    const leftIsHours = isHoursMetric(left);
    const rightIsHours = isHoursMetric(right);

    if (leftIsHours !== rightIsHours) {
      return leftIsHours ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function isHoursMetric(metric: GoalMetric) {
  return metric.unitLabel.toLowerCase() === "hours";
}

function MetricCard({
  entryValue,
  isSaving,
  metric,
  noteValue,
  onAddEntry,
  onEntryChange,
  onNoteChange,
}: {
  entryValue: string;
  isSaving: boolean;
  metric: GoalMetric;
  noteValue: string;
  onAddEntry: () => void;
  onEntryChange: (value: string) => void;
  onNoteChange: (value: string) => void;
}) {
  const progress =
    metric.targetValue > 0
      ? Math.min(metric.currentValue / metric.targetValue, 1)
      : 0;

  return (
    <View
      style={{
        borderRadius: 18,
        backgroundColor: "#fffaf2",
        borderWidth: 1,
        borderColor: "#ddd3c3",
        padding: 18,
        gap: 14,
      }}
    >
      <View style={{ gap: 6 }}>
        <Text
          style={{
            color: "#132521",
            fontSize: 18,
            fontWeight: "700",
          }}
        >
          {metric.name}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <Text
            style={{
              color: "#31413c",
              fontWeight: "700",
              flex: 1,
            }}
          >
            {formatMetricValue(metric.currentValue)} /{" "}
            {formatMetricValue(metric.targetValue)} {metric.unitLabel}
          </Text>
          <Text
            style={{
              color: "#5a6762",
              fontWeight: "700",
            }}
          >
            {Math.round(progress * 100)}%
          </Text>
        </View>
        <View
          style={{
            height: 12,
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

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <MetricChip
          label={
            metric.lastDeltaValue !== null
              ? `Latest +${formatMetricValue(metric.lastDeltaValue)}`
              : "No entries yet"
          }
        />
        <MetricChip label={metric.isActive ? "Active" : "Paused"} />
      </View>

      <View
        style={{
          paddingTop: 6,
          gap: 12,
          borderTopWidth: 1,
          borderTopColor: "#e6dccd",
        }}
      >
        <Text
          style={{
            color: "#31413c",
            fontWeight: "700",
          }}
        >
          Add progress manually
        </Text>
        <TextInput
          value={entryValue}
          onChangeText={onEntryChange}
          keyboardType="decimal-pad"
          placeholder={`Amount in ${metric.unitLabel}`}
          placeholderTextColor="#8c9793"
          style={singleLineInputStyle}
        />
        <TextInput
          value={noteValue}
          onChangeText={onNoteChange}
          placeholder="Optional note"
          placeholderTextColor="#8c9793"
          style={singleLineInputStyle}
        />
        <Pressable
          onPress={onAddEntry}
          disabled={isSaving}
          style={{
            borderRadius: 16,
            paddingVertical: 14,
            alignItems: "center",
            backgroundColor: isSaving ? "#cdd6d2" : "#123a35",
          }}
        >
          <Text
            style={{
              color: "#f4f0e8",
              fontWeight: "700",
            }}
          >
            {isSaving ? "Saving..." : "Add progress"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function formatMetricValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function MetricChip({ label }: { label: string }) {
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

const singleLineInputStyle = {
  borderRadius: 16,
  backgroundColor: "#f4eee2",
  paddingHorizontal: 12,
  paddingVertical: 12,
  color: "#132521",
} as const;
