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
import type { DerivedSchedulingSuggestion } from "@/features/scheduling-context/types";
import WorkspaceAuthGate from "@/features/workspace/components/WorkspaceAuthGate";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";

const EXAMPLE_CONTEXT = [
  "I work 9-5 on weekdays, so avoid scheduling during that time.",
  "I prefer work in 1 hour blocks.",
  "I don't like deep work after 8pm.",
  "I usually have more energy before lunch.",
].join("\n");

export default function SchedulingPreferencesScreen() {
  const { isAuthReady, isAuthenticated } = useAuth();
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
  const [screenError, setScreenError] = useState<string | null>(null);

  useEffect(() => {
    if (!schedulingContext) {
      return;
    }

    setDraftAdditionalNotes(schedulingContext.additionalNotes);
  }, [schedulingContext]);

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

const textInputStyle = {
  borderRadius: 16,
  borderWidth: 1,
  borderColor: "#d7cdc0",
  backgroundColor: "#f8f4ec",
  paddingHorizontal: 14,
  paddingVertical: 12,
  color: "#132521",
} as const;
