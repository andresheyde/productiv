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
import WorkspaceAuthGate from "@/features/workspace/components/WorkspaceAuthGate";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";

export default function MetricsScreen() {
  const { isAuthReady, isAuthenticated } = useAuth();
  const { addMetricEntry, goals, isLoading, metrics } = useWorkspace();
  const [entryDrafts, setEntryDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [savingMetricId, setSavingMetricId] = useState<string | null>(null);

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

        {metrics.map((metric) => {
          const progress = Math.min(metric.currentValue / metric.targetValue, 1);
          const goalTitle =
            goals.find((goal) => goal.id === metric.goalId)?.title ?? "Linked goal";

          return (
            <View
              key={metric.id}
              style={{
                borderRadius: 24,
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
                    color: "#5a6762",
                    fontSize: 13,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.7,
                  }}
                >
                  {goalTitle}
                </Text>
                <Text
                  style={{
                    color: "#132521",
                    fontSize: 20,
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
                  }}
                >
                  <Text
                    style={{
                      color: "#31413c",
                      fontWeight: "700",
                    }}
                  >
                    {metric.currentValue} / {metric.targetValue} {metric.unitLabel}
                  </Text>
                  <Text
                    style={{
                      color: "#5a6762",
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
                      ? `Latest +${metric.lastDeltaValue}`
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
                  value={entryDrafts[metric.id] ?? ""}
                  onChangeText={(value) =>
                    setEntryDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [metric.id]: value,
                    }))
                  }
                  keyboardType="decimal-pad"
                  placeholder={`Amount in ${metric.unitLabel}`}
                  placeholderTextColor="#8c9793"
                  style={singleLineInputStyle}
                />
                <TextInput
                  value={noteDrafts[metric.id] ?? ""}
                  onChangeText={(value) =>
                    setNoteDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [metric.id]: value,
                    }))
                  }
                  placeholder="Optional note"
                  placeholderTextColor="#8c9793"
                  style={singleLineInputStyle}
                />
                <Pressable
                  onPress={() => {
                    void handleAddEntry(metric.id);
                  }}
                  disabled={savingMetricId === metric.id}
                  style={{
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: "center",
                    backgroundColor:
                      savingMetricId === metric.id ? "#cdd6d2" : "#123a35",
                  }}
                >
                  <Text
                    style={{
                      color: "#f4f0e8",
                      fontWeight: "700",
                    }}
                  >
                    {savingMetricId === metric.id ? "Saving..." : "Add progress"}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
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
