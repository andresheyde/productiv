import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { BackendScheduleEvent } from "@/features/schedule/api/scheduleApi";
import { formatLocaleDateTime } from "@/features/shared/utils/dateTime";

type EventsPreviewCardProps = {
  events: BackendScheduleEvent[];
  errorMessage: string | null;
  isLoadingEvents: boolean;
  canFetchEvents: boolean;
  onFetchEvents: () => Promise<void>;
};

export default function EventsPreviewCard({
  events,
  errorMessage,
  isLoadingEvents,
  canFetchEvents,
  onFetchEvents,
}: EventsPreviewCardProps) {
  return (
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
        3. Preview events
      </Text>
      <Pressable
        onPress={onFetchEvents}
        disabled={!canFetchEvents}
        style={{
          backgroundColor: "#f6c453",
          opacity: canFetchEvents ? 1 : 0.6,
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 14,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: "#1f2937",
            fontSize: 15,
            fontWeight: "700",
          }}
        >
          {isLoadingEvents ? "Loading events..." : "Fetch events"}
        </Text>
      </Pressable>

      {isLoadingEvents ? <ActivityIndicator color="#16423c" /> : null}

      {errorMessage ? (
        <Text
          style={{
            color: "#b42318",
            fontWeight: "600",
          }}
        >
          {errorMessage}
        </Text>
      ) : null}

      {!isLoadingEvents && events.length === 0 ? (
        <Text
          style={{
            color: "#5f6b76",
            lineHeight: 20,
          }}
        >
          Once you connect Google and fetch events, they’ll appear here as a
          simple schedule preview.
        </Text>
      ) : null}

      {events.map((event) => (
        <View
          key={event.id}
          style={{
            borderRadius: 16,
            backgroundColor: "#f4f1ea",
            padding: 14,
            gap: 4,
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: "#1f2937",
            }}
          >
            {event.title}
          </Text>
          <Text style={{ color: "#5f6b76" }}>
            Start: {formatLocaleDateTime(event.startTime)}
          </Text>
          <Text style={{ color: "#5f6b76" }}>
            End: {formatLocaleDateTime(event.endTime)}
          </Text>
        </View>
      ))}
    </View>
  );
}
