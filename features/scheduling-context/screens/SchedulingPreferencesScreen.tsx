import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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
import {
  fetchGoogleCalendarSources,
  updateGoogleCalendarSources,
  type GoogleCalendarSource,
} from "@/features/calendar/api/googleCalendarApi";
import type {
  DerivedSchedulingSuggestion,
  SchedulingPreferenceRule,
} from "@/features/scheduling-context/types";
import WorkspaceAuthGate from "@/features/workspace/components/WorkspaceAuthGate";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";

const EXAMPLE_CONTEXT = [
  "I work 9-5 on weekdays, so avoid scheduling during that time.",
  "I prefer work in 1 hour blocks.",
  "I don't like deep work after 8pm.",
  "I usually have more energy before lunch.",
].join("\n");

export default function SchedulingPreferencesScreen() {
  const { isAuthReady, isAuthenticated, sessionToken } = useAuth();
  const {
    isLoading,
    schedulingContext,
    schedulingSuggestions,
    updateSchedulingContext,
    acceptSchedulingSuggestion,
    dismissSchedulingSuggestion,
  } = useWorkspace();
  const [draftAdditionalNotes, setDraftAdditionalNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [busySuggestionId, setBusySuggestionId] = useState<string | null>(null);
  const [calendarSources, setCalendarSources] = useState<GoogleCalendarSource[]>(
    [],
  );
  const [busyCalendarSourceId, setBusyCalendarSourceId] = useState<string | null>(
    null,
  );
  const [isLoadingCalendarSources, setIsLoadingCalendarSources] = useState(false);
  const [screenError, setScreenError] = useState<string | null>(null);

  useEffect(() => {
    if (!schedulingContext) {
      return;
    }

    setDraftAdditionalNotes(schedulingContext.additionalNotes);
  }, [schedulingContext]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCalendarSources([]);
      return;
    }

    let isCanceled = false;
    setIsLoadingCalendarSources(true);

    fetchGoogleCalendarSources(sessionToken)
      .then((sources) => {
        if (!isCanceled) {
          setCalendarSources(sources);
        }
      })
      .catch((error) => {
        if (!isCanceled) {
          setScreenError(
            error instanceof Error
              ? error.message
              : "Failed to load calendar sources.",
          );
        }
      })
      .finally(() => {
        if (!isCanceled) {
          setIsLoadingCalendarSources(false);
        }
      });

    return () => {
      isCanceled = true;
    };
  }, [isAuthenticated, sessionToken]);

  const canSave = useMemo(
    () => !!schedulingContext && !isSaving,
    [isSaving, schedulingContext],
  );

  if (!isAuthReady) {
    return (
      <LoadingState />
    );
  }

  if (!isAuthenticated) {
    return (
      <WorkspaceAuthGate
        title="Scheduling preferences need your account"
        description="Connect Google to save the recurring context Productiv should respect while planning and scheduling."
      />
    );
  }

  if (!schedulingContext) {
    return (
      <LoadingState />
    );
  }

  async function handleSave() {
    setScreenError(null);
    setIsSaving(true);

    try {
      await updateSchedulingContext({
        additionalNotes: draftAdditionalNotes,
      });
    } catch (error) {
      setScreenError(
        error instanceof Error
          ? error.message
          : "Failed to save scheduling context.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAcceptSuggestion(suggestion: DerivedSchedulingSuggestion) {
    setScreenError(null);
    setBusySuggestionId(suggestion.id);

    try {
      await acceptSchedulingSuggestion(suggestion.id);
    } catch (error) {
      setScreenError(
        error instanceof Error
          ? error.message
          : "Failed to accept scheduling suggestion.",
      );
    } finally {
      setBusySuggestionId(null);
    }
  }

  async function handleDismissSuggestion(suggestion: DerivedSchedulingSuggestion) {
    setScreenError(null);
    setBusySuggestionId(suggestion.id);

    try {
      await dismissSchedulingSuggestion(suggestion.id);
    } catch (error) {
      setScreenError(
        error instanceof Error
          ? error.message
          : "Failed to dismiss scheduling suggestion.",
      );
    } finally {
      setBusySuggestionId(null);
    }
  }

  async function handleToggleCalendarSource(source: GoogleCalendarSource) {
    setScreenError(null);
    setBusyCalendarSourceId(source.id);

    const nextSources = calendarSources.map((calendarSource) =>
      calendarSource.id === source.id
        ? { ...calendarSource, included: !calendarSource.included }
        : calendarSource,
    );
    setCalendarSources(nextSources);

    try {
      const updatedSources = await updateGoogleCalendarSources({
        includedCalendarIds: nextSources
          .filter((calendarSource) => calendarSource.included)
          .map((calendarSource) => calendarSource.id),
        sessionToken,
      });
      setCalendarSources(updatedSources);
    } catch (error) {
      setCalendarSources(calendarSources);
      setScreenError(
        error instanceof Error
          ? error.message
          : "Failed to update calendar sources.",
      );
    } finally {
      setBusyCalendarSourceId(null);
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
            Scheduling Preferences
          </Text>
          <Text
            style={{
              color: "#bfd1ca",
              lineHeight: 20,
            }}
          >
            Add any standing context Productiv should keep in mind when it plans
            or proposes schedule changes. Productiv can suggest updates, but you
            stay in control.
          </Text>
        </View>

        {screenError ? <BannerCard text={screenError} /> : null}

        {isLoading ? <ActivityIndicator size="large" color="#123a35" /> : null}

        <SectionCard
          title="Additional Context"
          description="Write this naturally. Productiv will read it, compile the useful parts into scheduling context, and ask before saving any derived suggestions."
        >
          <TextInput
            value={draftAdditionalNotes}
            onChangeText={setDraftAdditionalNotes}
            placeholder={EXAMPLE_CONTEXT}
            placeholderTextColor="#88938d"
            multiline
            textAlignVertical="top"
            style={{
              ...textInputStyle,
              minHeight: 180,
              paddingTop: 14,
            }}
          />

          <Pressable
            onPress={() => {
              void handleSave();
            }}
            disabled={!canSave}
            style={{
              borderRadius: 20,
              paddingHorizontal: 18,
              paddingVertical: 16,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: canSave ? "#123a35" : "#cfd7d2",
            }}
          >
            {isSaving ? <ActivityIndicator color="#f4f0e8" /> : null}
            <Text
              style={{
                color: "#f4f0e8",
                fontWeight: "700",
                fontSize: 15,
              }}
            >
              {isSaving ? "Saving context..." : "Save scheduling context"}
            </Text>
          </Pressable>
        </SectionCard>

        <SectionCard
          title="What Productiv Understands"
          description="This is the compact scheduling summary Productiv is currently using behind the scenes."
        >
          <Text
            style={{
              color: "#132521",
              lineHeight: 22,
            }}
          >
            {schedulingContext.compiledSummary.trim().length > 0
              ? schedulingContext.compiledSummary
              : "No compiled scheduling context yet. Add some notes above and save to give Productiv durable preferences to work from."}
          </Text>
        </SectionCard>

        <SectionCard
          title="Learning From Feedback"
          description="Productiv uses accepted memory as durable guidance and treats recent feedback as tentative until you approve it."
        >
          <LearningRuleGroup
            emptyText="No accepted learned rules yet. Accept suggestions below to make recurring patterns durable."
            label="Accepted memory"
            rules={schedulingContext.activeRules.filter(
              (rule) => rule.source === "derived",
            )}
            tone="accepted"
          />
          <LearningRuleGroup
            emptyText="No tentative feedback patterns right now. Productiv will show recent schedule feedback here when it can use it softly."
            label="Trying from recent feedback"
            rules={schedulingContext.tentativeRules}
            tone="tentative"
          />
        </SectionCard>

        <SectionCard
          title="Calendar Sources"
          description="Choose which Google calendars Productiv should show and pass into scheduling conversations."
        >
          {isLoadingCalendarSources ? (
            <ActivityIndicator color="#123a35" />
          ) : calendarSources.length === 0 ? (
            <Text
              style={{
                color: "#5a6762",
                lineHeight: 20,
              }}
            >
              No Google calendars are available from the connected account.
            </Text>
          ) : (
            <View style={{ gap: 10 }}>
              {calendarSources.map((source) => (
                <CalendarSourceRow
                  key={source.id}
                  source={source}
                  isBusy={busyCalendarSourceId === source.id}
                  onToggle={() => {
                    void handleToggleCalendarSource(source);
                  }}
                />
              ))}
            </View>
          )}
        </SectionCard>

        <SectionCard
          title="Suggested Updates"
          description="When Productiv notices a pattern worth saving, it shows up here for approval."
        >
          {schedulingSuggestions.length === 0 ? (
            <Text
              style={{
                color: "#5a6762",
                lineHeight: 20,
              }}
            >
              No suggestions right now. As you add context, Productiv can suggest
              durable rules like weekday work hours, preferred block length, or
              evening cutoffs.
            </Text>
          ) : (
            <View style={{ gap: 12 }}>
              {schedulingSuggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  isBusy={busySuggestionId === suggestion.id}
                  onAccept={() => {
                    void handleAcceptSuggestion(suggestion);
                  }}
                  onDismiss={() => {
                    void handleDismissSuggestion(suggestion);
                  }}
                />
              ))}
            </View>
          )}
        </SectionCard>
      </ScrollView>
    </SafeAreaView>
  );
}

function LoadingState() {
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

type SectionCardProps = {
  title: string;
  description: string;
  children: ReactNode;
};

function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <View
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
            color: "#132521",
            fontWeight: "700",
            fontSize: 20,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            color: "#5a6762",
            lineHeight: 21,
          }}
        >
          {description}
        </Text>
      </View>
      {children}
    </View>
  );
}

function BannerCard({ text }: { text: string }) {
  return (
    <View
      style={{
        borderRadius: 18,
        backgroundColor: "#f8e7e3",
        borderWidth: 1,
        borderColor: "#e6b9ad",
        padding: 14,
      }}
    >
      <Text
        style={{
          color: "#8a3a2f",
          lineHeight: 20,
          fontWeight: "700",
        }}
      >
        {text}
      </Text>
    </View>
  );
}

type SuggestionCardProps = {
  suggestion: DerivedSchedulingSuggestion;
  isBusy: boolean;
  onAccept: () => void;
  onDismiss: () => void;
};

function SuggestionCard({
  suggestion,
  isBusy,
  onAccept,
  onDismiss,
}: SuggestionCardProps) {
  const scopeLabel = getRuleScopeLabel(suggestion);
  const impactLabel = getRuleImpactLabel(suggestion);

  return (
    <View
      style={{
        borderRadius: 18,
        backgroundColor: "#f7f2e8",
        borderWidth: 1,
        borderColor: "#e5dac6",
        padding: 14,
        gap: 12,
      }}
    >
      <View style={{ gap: 6 }}>
        <Text
          style={{
            color: "#132521",
            fontWeight: "700",
            fontSize: 16,
          }}
        >
          {suggestion.title}
        </Text>
        <Text
          style={{
            color: "#5a6762",
            lineHeight: 20,
          }}
        >
          {suggestion.detail}
        </Text>
        <Text
          style={{
            color: "#7d6f61",
            fontSize: 12,
            fontWeight: "700",
          }}
        >
          {scopeLabel}
        </Text>
        <Text
          style={{
            color: "#31504a",
            fontSize: 12,
            fontWeight: "800",
            lineHeight: 17,
          }}
        >
          {impactLabel}
        </Text>
        <Text
          style={{
            color: "#7d6f61",
            fontSize: 12,
            fontWeight: "700",
          }}
        >
          {suggestion.strength === "hard_constraint"
            ? "Hard constraint suggestion"
            : "Soft preference suggestion"}
          {suggestion.confidence ? ` · ${suggestion.confidence} confidence` : ""}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          gap: 10,
        }}
      >
        <Pressable
          onPress={onAccept}
          disabled={isBusy}
          style={{
            flex: 1,
            borderRadius: 16,
            paddingVertical: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#123a35",
          }}
        >
          <Text
            style={{
              color: "#f4f0e8",
              fontWeight: "700",
            }}
          >
            {isBusy ? "Working..." : "Accept"}
          </Text>
        </Pressable>

        <Pressable
          onPress={onDismiss}
          disabled={isBusy}
          style={{
            flex: 1,
            borderRadius: 16,
            paddingVertical: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#efe9dd",
          }}
        >
          <Text
            style={{
              color: "#31413c",
              fontWeight: "700",
            }}
          >
            Dismiss
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

type LearningRuleGroupProps = {
  emptyText: string;
  label: string;
  rules: SchedulingPreferenceRule[];
  tone: "accepted" | "tentative";
};

function LearningRuleGroup({
  emptyText,
  label,
  rules,
  tone,
}: LearningRuleGroupProps) {
  return (
    <View style={{ gap: 10 }}>
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
            color: "#132521",
            fontWeight: "800",
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: tone === "accepted" ? "#123a35" : "#7d6f61",
            fontSize: 12,
            fontWeight: "800",
          }}
        >
          {rules.length}
        </Text>
      </View>

      {rules.length === 0 ? (
        <Text
          style={{
            color: "#5a6762",
            lineHeight: 20,
          }}
        >
          {emptyText}
        </Text>
      ) : (
        <View style={{ gap: 0 }}>
          {rules.map((rule, index) => (
            <LearningRuleRow
              key={rule.id}
              isFirst={index === 0}
              rule={rule}
              tone={tone}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function LearningRuleRow({
  isFirst,
  rule,
  tone,
}: {
  isFirst: boolean;
  rule: SchedulingPreferenceRule;
  tone: "accepted" | "tentative";
}) {
  const impactLabel = getRuleImpactLabel(rule);

  return (
    <View
      style={{
        borderTopWidth: isFirst ? 0 : 1,
        borderColor: "#e5dac6",
        paddingVertical: 11,
        gap: 5,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 8,
        }}
      >
        <Text
          style={{
            color: "#132521",
            flex: 1,
            fontSize: 15,
            fontWeight: "800",
            lineHeight: 20,
          }}
        >
          {rule.title}
        </Text>
        <Text
          style={{
            color: tone === "accepted" ? "#123a35" : "#7d6f61",
            fontSize: 11,
            fontWeight: "800",
          }}
        >
          {tone === "accepted" ? "Accepted" : "Trying"}
        </Text>
      </View>
      <Text
        style={{
          color: "#5a6762",
          lineHeight: 20,
        }}
      >
        {rule.detail}
      </Text>
      <Text
        style={{
          color: "#7d6f61",
          fontSize: 12,
          fontWeight: "700",
        }}
      >
        {getRuleScopeLabel(rule)}
        {rule.confidence ? ` / ${rule.confidence} confidence` : ""}
      </Text>
      <Text
        style={{
          color: tone === "accepted" ? "#31504a" : "#7d6f61",
          fontSize: 12,
          fontWeight: "800",
          lineHeight: 17,
        }}
      >
        {impactLabel}
      </Text>
    </View>
  );
}

function getRuleImpactLabel(rule: SchedulingPreferenceRule) {
  const temporalScope = getMetadataString(rule.metadata, "temporalScope");
  const detail = rule.detail.toLowerCase();
  const title = rule.title.toLowerCase();

  if (
    rule.kind === "no_schedule_window" &&
    rule.strength === "soft_preference" &&
    temporalScope
  ) {
    return `Use in drafts: avoid ${temporalScope} slots when possible.`;
  }

  if (
    rule.kind === "preferred_work_period" &&
    getMetadataString(rule.metadata, "activityTitle") &&
    temporalScope
  ) {
    return `Use in drafts: prefer ${temporalScope} for matching work.`;
  }

  if (
    rule.kind === "custom" &&
    (title.includes("lighter") ||
      detail.includes("buffer") ||
      detail.includes("breathing room"))
  ) {
    return "Use in drafts: leave more buffer and keep days lighter.";
  }

  if (rule.strength === "hard_constraint") {
    return "Use in drafts: avoid conflicts unless you explicitly override it.";
  }

  return "Use in drafts: soft guidance when Productiv picks times.";
}

function getRuleScopeLabel(rule: SchedulingPreferenceRule) {
  const scope = getMetadataString(rule.metadata, "applicabilityScope");

  if (!scope || scope === "global") {
    return "Scope: Global";
  }

  const domain = getMetadataString(rule.metadata, "domain");
  const goalTitle = getMetadataString(rule.metadata, "goalTitle");
  const activityTitle = getMetadataString(rule.metadata, "activityTitle");
  const temporalScope = getMetadataString(rule.metadata, "temporalScope");

  if (scope === "domain" && domain) {
    return `Scope: ${domain}`;
  }

  if (scope === "goal" && goalTitle) {
    return `Scope: Goal - ${goalTitle}`;
  }

  if (scope === "activity" && activityTitle) {
    return `Scope: Activity - ${activityTitle}`;
  }

  if (scope === "temporary" && temporalScope) {
    return `Scope: Temporary - ${temporalScope}`;
  }

  return `Scope: ${scope.charAt(0).toUpperCase()}${scope.slice(1)}`;
}

function getMetadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function CalendarSourceRow({
  isBusy,
  onToggle,
  source,
}: {
  isBusy: boolean;
  onToggle: () => void;
  source: GoogleCalendarSource;
}) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={isBusy}
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: source.included ? "#a8c9bf" : "#e0d4c3",
        backgroundColor: source.included ? "#eef7f3" : "#f7f2e8",
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: 999,
          backgroundColor: source.backgroundColor ?? "#1f6f78",
        }}
      />
      <View style={{ flex: 1, gap: 3 }}>
        <Text
          style={{
            color: "#132521",
            fontWeight: "700",
          }}
          numberOfLines={1}
        >
          {source.summary}
        </Text>
        <Text
          style={{
            color: "#68736f",
            fontSize: 12,
            fontWeight: "700",
          }}
        >
          {source.primary ? "Primary calendar" : source.accessRole ?? "Calendar"}
        </Text>
      </View>
      <View
        style={{
          borderRadius: 999,
          backgroundColor: source.included ? "#123a35" : "#d8cec0",
          paddingHorizontal: 10,
          paddingVertical: 7,
          minWidth: 82,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: source.included ? "#f4f0e8" : "#31413c",
            fontSize: 12,
            fontWeight: "800",
          }}
        >
          {isBusy ? "Saving" : source.included ? "Included" : "Excluded"}
        </Text>
      </View>
    </Pressable>
  );
}

const textInputStyle = {
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "#d7cdc0",
  backgroundColor: "#f8f4ec",
  paddingHorizontal: 14,
  paddingVertical: 12,
  color: "#132521",
} as const;
