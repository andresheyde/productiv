import { Link } from "expo-router";
import { Text, View } from "react-native";

export default function ScheduleHero() {
  return (
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
        Build your next week
      </Text>
      <Text
        style={{
          fontSize: 16,
          lineHeight: 22,
          color: "#d9e7e3",
        }}
      >
        Pick a future date range, connect Google Calendar, and preview the
        events that will shape your schedule.
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Link
          href="/"
          style={{
            color: "#f6c453",
            fontWeight: "600",
          }}
        >
          Open the planning intake
        </Link>
        <Link
          href="/calendar"
          style={{
            color: "#d9e7e3",
            fontWeight: "600",
          }}
        >
          Open the calendar editor
        </Link>
      </View>
    </View>
  );
}
